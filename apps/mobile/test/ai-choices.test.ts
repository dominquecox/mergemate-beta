import { describe, expect, it } from "vitest";
import type { AiPreferenceUpdate, AiPreferences } from "@mergemate/contracts";
import { ApiClientError, messageForCode } from "../src/api/errors";
import { AiChoices, isAiConsentCurrent, needsConsentReview, type AiChoicesApi } from "../src/consent/aiChoices";
import { MockApiClient } from "../src/api/mock";
import { errorResponse, jsonResponse, makeClient } from "./helpers";

const prefs = (over: Partial<AiPreferences> & { granted?: boolean; version?: string } = {}): AiPreferences => ({
  ai: { granted: over.granted ?? false, version: over.version ?? "1", currentVersion: "1" },
  aiSummaries: over.aiSummaries ?? true,
  revision: over.revision ?? "r1",
});

const deferred = <T>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => ((resolve = a), (reject = b)));
  return { promise, resolve, reject };
};

/** A scriptable API: each call takes the next queued outcome. */
const scripted = () => {
  const reads: Array<() => Promise<AiPreferences>> = [];
  const writes: Array<(u: AiPreferenceUpdate) => Promise<AiPreferences>> = [];
  const sent: AiPreferenceUpdate[] = [];
  const api: AiChoicesApi = {
    getAiPreferences: () => (reads.shift() ?? (() => Promise.reject(new Error("no read queued"))))(),
    updateAiPreferences: (u) => {
      sent.push(u);
      return (writes.shift() ?? (() => Promise.reject(new Error("no write queued"))))(u);
    },
  };
  return { api, reads, writes, sent };
};
const ok = (p: AiPreferences) => () => Promise.resolve(p);
const fail = (code: string) => () => Promise.reject(new ApiClientError(code as never, messageForCode(code as never)));

describe("AI choices store", () => {
  it("shows nothing as agreed until the server says so", async () => {
    const s = scripted();
    const choices = new AiChoices(s.api);
    expect(choices.getState().prefs).toBeNull();
    expect(isAiConsentCurrent(choices.getState().prefs)).toBe(false);
    s.reads.push(ok(prefs({ granted: true })));
    await choices.refresh();
    expect(isAiConsentCurrent(choices.getState().prefs)).toBe(true);
    expect(choices.getState().loading).toBe(false);
  });

  it("does not count a grant for another consent version", async () => {
    const s = scripted();
    const choices = new AiChoices(s.api);
    s.reads.push(ok(prefs({ granted: true, version: "0" })));
    await choices.refresh();
    expect(isAiConsentCurrent(choices.getState().prefs)).toBe(false);
    expect(needsConsentReview(choices.getState().prefs)).toBe(true);
  });

  it("grants with the current version and the revision it read", async () => {
    const s = scripted();
    const choices = new AiChoices(s.api);
    s.reads.push(ok(prefs({ revision: "r7" })));
    await choices.refresh();
    s.writes.push(ok(prefs({ granted: true, revision: "r8" })));
    expect(await choices.grant()).toBe(true);
    expect(s.sent).toEqual([{ action: "grant", version: "1", expectedRevision: "r7" }]);
    expect(choices.getState().prefs?.revision).toBe("r8");
  });

  it("never reports a saved state after a failed request, and keeps what was confirmed", async () => {
    const s = scripted();
    const choices = new AiChoices(s.api);
    s.reads.push(ok(prefs({ granted: false })));
    await choices.refresh();
    s.writes.push(fail("network"));
    expect(await choices.grant()).toBe(false);
    expect(isAiConsentCurrent(choices.getState().prefs)).toBe(false);
    expect(choices.getState().error).toBeTruthy();
    expect(choices.getState().pending).toBeNull();
  });

  it("a failed revoke leaves AI on and says so; a revoke needs no revision", async () => {
    const s = scripted();
    const choices = new AiChoices(s.api);
    s.reads.push(ok(prefs({ granted: true })));
    await choices.refresh();
    s.writes.push(fail("upstream_unavailable"));
    expect(await choices.revoke()).toBe(false);
    expect(isAiConsentCurrent(choices.getState().prefs)).toBe(true);
    s.writes.push(ok(prefs({ granted: false, aiSummaries: false, revision: "r2" })));
    expect(await choices.revoke()).toBe(true);
    expect(s.sent[1]).toEqual({ action: "revoke" });
    expect(isAiConsentCurrent(choices.getState().prefs)).toBe(false);
  });

  it("recovers from a change made elsewhere by reloading the server state and keeping the message", async () => {
    const s = scripted();
    const choices = new AiChoices(s.api);
    s.reads.push(ok(prefs({ granted: false, revision: "r1" })));
    await choices.refresh();
    s.writes.push(fail("consent_changed"));
    s.reads.push(ok(prefs({ granted: true, revision: "r2" })));
    expect(await choices.setSummaries(false)).toBe(false);
    expect(choices.getState().prefs).toMatchObject({ revision: "r2", ai: { granted: true } });
    expect(choices.getState().error).toBe(messageForCode("consent_changed" as never));
    // The next try uses the new revision.
    s.writes.push(ok(prefs({ granted: true, aiSummaries: false, revision: "r3" })));
    expect(await choices.setSummaries(false)).toBe(true);
    expect(s.sent[1]).toMatchObject({ expectedRevision: "r2" });
  });

  it("refuses to send a change before the choices are loaded, then loads them", async () => {
    const s = scripted();
    const choices = new AiChoices(s.api);
    s.reads.push(ok(prefs()));
    expect(await choices.grant()).toBe(false);
    expect(s.sent).toEqual([]);
    await new Promise((r) => setTimeout(r, 0));
    expect(choices.getState().error).toMatch(/aren't loaded/);
    expect(choices.getState().prefs?.revision).toBe("r1");
  });

  it("ignores a second change while one is being saved", async () => {
    const s = scripted();
    const choices = new AiChoices(s.api);
    s.reads.push(ok(prefs()));
    await choices.refresh();
    const gate = deferred<AiPreferences>();
    s.writes.push(() => gate.promise);
    const first = choices.grant();
    expect(choices.getState().pending).toBe("grant");
    expect(await choices.revoke()).toBe(false);
    gate.resolve(prefs({ granted: true, revision: "r2" }));
    expect(await first).toBe(true);
    expect(s.sent).toHaveLength(1);
  });

  it("drops answers that arrive after the account changed", async () => {
    const s = scripted();
    const choices = new AiChoices(s.api);
    const gate = deferred<AiPreferences>();
    s.reads.push(() => gate.promise);
    const read = choices.refresh();
    choices.reset();
    gate.resolve(prefs({ granted: true }));
    expect(await read).toBe(false);
    expect(choices.getState().prefs).toBeNull();
    expect(choices.getState().loading).toBe(true);
  });

  it("drops a write result that arrives after sign-out", async () => {
    const s = scripted();
    const choices = new AiChoices(s.api);
    s.reads.push(ok(prefs()));
    await choices.refresh();
    const gate = deferred<AiPreferences>();
    s.writes.push(() => gate.promise);
    const write = choices.grant();
    choices.reset();
    gate.resolve(prefs({ granted: true, revision: "r2" }));
    expect(await write).toBe(false);
    expect(choices.getState().prefs).toBeNull();
    expect(choices.getState().pending).toBeNull();
  });

  it("a foreground read that finishes during a save does not replace the save's answer", async () => {
    const s = scripted();
    const choices = new AiChoices(s.api);
    s.reads.push(ok(prefs({ revision: "r1" })));
    await choices.refresh();
    const write = deferred<AiPreferences>();
    s.writes.push(() => write.promise);
    const saving = choices.grant();
    s.reads.push(ok(prefs({ revision: "r1" })));
    await choices.refresh();
    write.resolve(prefs({ granted: true, revision: "r2" }));
    await saving;
    expect(choices.getState().prefs).toMatchObject({ revision: "r2", ai: { granted: true } });
  });

  it("a failed foreground read keeps the last confirmed state and shows the problem", async () => {
    const s = scripted();
    const choices = new AiChoices(s.api);
    s.reads.push(ok(prefs({ granted: true })));
    await choices.refresh();
    s.reads.push(fail("network"));
    expect(await choices.refresh()).toBe(false);
    expect(isAiConsentCurrent(choices.getState().prefs)).toBe(true);
    expect(choices.getState().error).toBeTruthy();
  });

  it("notifies subscribers and stops after unsubscribe", async () => {
    const s = scripted();
    const choices = new AiChoices(s.api);
    let n = 0;
    const off = choices.subscribe(() => n++);
    s.reads.push(ok(prefs()));
    await choices.refresh();
    expect(n).toBeGreaterThan(0);
    off();
    const seen = n;
    choices.reset();
    expect(n).toBe(seen);
  });
});

describe("AI choices over HTTP", () => {
  const body = prefs({ granted: true });
  it("reads canonical state and sends the revision with each change", async () => {
    const { client, calls } = makeClient((req) => jsonResponse(body), { platform: "native", token: "tok_aaaaaaaaaaaaaaaaaaaaaa" });
    await expect(client.getAiPreferences()).resolves.toEqual(body);
    await client.updateAiPreferences({ action: "grant", version: "1", expectedRevision: "r1" });
    expect(calls[0]?.path).toBe("/consent/preferences");
    expect(calls[1]).toMatchObject({ method: "PUT", path: "/consent/preferences", body: { action: "grant", version: "1", expectedRevision: "r1" } });
  });

  it("surfaces a changed-elsewhere conflict as its own code", async () => {
    const { client } = makeClient(() => errorResponse("consent_changed", 409), { platform: "native", token: "tok_aaaaaaaaaaaaaaaaaaaaaa" });
    await expect(client.updateAiPreferences({ action: "revoke" })).rejects.toMatchObject({ code: "consent_changed" });
  });

  it("rejects an answer that is not the AI choices shape", async () => {
    const { client } = makeClient(() => jsonResponse({ ai: { granted: true } }), { platform: "native", token: "tok_aaaaaaaaaaaaaaaaaaaaaa" });
    await expect(client.getAiPreferences()).rejects.toBeTruthy();
  });
});

describe("AI choices in the sample-data client", () => {
  it("grants, toggles summaries and revokes with revision checks", async () => {
    const mock = new MockApiClient();
    const start = await mock.getAiPreferences();
    const granted = await mock.updateAiPreferences({ action: "grant", version: "1", expectedRevision: start.revision });
    expect(granted.revision).not.toBe(start.revision);
    await expect(mock.updateAiPreferences({ action: "summaries", enabled: false, expectedRevision: start.revision })).rejects.toMatchObject({ code: "consent_changed" });
    const off = await mock.updateAiPreferences({ action: "summaries", enabled: false, expectedRevision: granted.revision });
    expect(off.aiSummaries).toBe(false);
    expect((await mock.updateAiPreferences({ action: "revoke" })).ai.granted).toBe(false);
  });
});
