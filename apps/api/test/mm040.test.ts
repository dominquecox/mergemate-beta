import { ConsentState, ErrorBody, Me } from "@mergemate/contracts";
import { describe, expect, it } from "vitest";
import { demoHeaders } from "./demo-session";
import { testContext } from "./helpers";
import { appFor, post, signIn } from "./sign-in";

const encoded = encodeURIComponent("octo/demo#1");
const del = (headers: Record<string, string>): RequestInit => ({ method: "DELETE", headers });

describe("MM-040 API follow-ups", () => {
  it("reports a missing or stale CSRF token as csrf_invalid, not forbidden", async () => {
    const ctx = testContext();
    const call = appFor(ctx);
    const { headers, csrf } = await signIn(ctx, "web");
    const missing = await call("/v1/consent", { method: "PUT", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ ai: { granted: true, version: "2" } }) });
    expect(missing.status).toBe(403);
    expect(ErrorBody.parse(await missing.json()).error.code).toBe("csrf_invalid");
    const stale = await call("/v1/consent", { method: "PUT", headers: { ...headers, "content-type": "application/json", "x-csrf-token": "stale" }, body: JSON.stringify({ ai: { granted: true, version: "2" } }) });
    expect(ErrorBody.parse(await stale.json()).error.code).toBe("csrf_invalid");
    const ok = await call("/v1/consent", { method: "PUT", headers: { ...headers, "content-type": "application/json", "x-csrf-token": csrf ?? "" }, body: JSON.stringify({ ai: { granted: true, version: "2" } }) });
    expect(ok.status).toBe(200);
  });

  it("says on GET /v1/me whether the session is a demo", async () => {
    const ctx = testContext();
    const call = appFor(ctx);
    const { headers } = await signIn(ctx, "ios");
    expect(Me.parse(await (await call("/v1/me", { headers })).json())).toMatchObject({ login: "octo-dev", demo: false });
    expect(Me.parse(await (await call("/v1/me", { headers: await demoHeaders(ctx) })).json()).demo).toBe(true);
  });

  it("returns the current consent version next to the stored one", async () => {
    const ctx = testContext();
    const { headers } = await signIn(ctx, "ios");
    const body = ConsentState.parse(await (await appFor(ctx)("/v1/consent", { headers })).json());
    expect(body.ai.currentVersion).toBe("2");
  });

  it("undoes a triage choice for the signed-in user only, idempotently", async () => {
    const ctx = testContext();
    const call = appFor(ctx);
    const alice = await signIn(ctx, "ios");
    const bob = await signIn(ctx, "ios", { id: 99, login: "bob", name: null, avatar_url: "https://avatars.githubusercontent.com/u/99?v=4" });
    expect((await call(`/v1/triage/${encoded}`, post({ lane: "ignore" }, alice.headers))).status).toBe(200);
    expect((await call(`/v1/triage/${encoded}`, post({ lane: "fyi" }, bob.headers))).status).toBe(200);

    expect((await call(`/v1/triage/${encoded}`, del(alice.headers))).status).toBe(204);
    expect((await call(`/v1/triage/${encoded}`, del(alice.headers))).status).toBe(204);
    const rows = ctx.db.rows<{ user_id: string; lane: string }>("SELECT user_id, lane FROM triage_choices");
    expect(rows).toEqual([{ user_id: bob.userId, lane: "fyi" }]);
  });

  it("rejects triage undo from demo sessions and for bad references", async () => {
    const ctx = testContext();
    const call = appFor(ctx);
    expect((await call(`/v1/triage/${encoded}`, del(await demoHeaders(ctx)))).status).toBe(403);
    const { headers } = await signIn(ctx, "ios");
    expect((await call("/v1/triage/nonsense", del(headers))).status).toBe(422);
    expect((await call(`/v1/triage/${encoded}`, del({}))).status).toBe(401);
  });
});
