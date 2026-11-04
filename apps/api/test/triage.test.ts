import { TriageQueue, TriageRecord } from "@mergemate/contracts";
import type { TriageItem } from "@mergemate/contracts";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { demoHeaders } from "./demo-session";
import { fakeAi, json, testContext, validModelEnv } from "./helpers";
import type { AiRun, TestContext } from "./helpers";
import { setSummaries } from "./ai-choices";
import { appFor, post, signIn } from "./sign-in";

const encoded = encodeURIComponent("octo/demo#1");

describe("triage routes", () => {
  it("requires sign-in", async () => {
    const ctx = testContext();
    expect((await appFor(ctx)("/v1/triage", {})).status).toBe(401);
  });

  it("serves the fixture queue to demo sessions", async () => {
    const ctx = testContext();
    const res = await appFor(ctx)("/v1/triage", { headers: await demoHeaders(ctx) });
    expect(res.status).toBe(200);
    expect(TriageQueue.parse(await res.json()).length).toBeGreaterThan(0);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("rejects demo choice writes", async () => {
    const ctx = testContext();
    const res = await appFor(ctx)(
      `/v1/triage/${encoded}`,
      post({ lane: "fyi" }, await demoHeaders(ctx)),
    );
    expect(res.status).toBe(403);
  });

  it("records a choice and echoes it back", async () => {
    const ctx = testContext();
    const call = appFor(ctx);
    const { headers } = await signIn(ctx, "ios");
    const res = await call(`/v1/triage/${encoded}`, post({ lane: "ignore" }, headers));
    expect(res.status).toBe(200);
    expect(TriageRecord.parse(await res.json())).toEqual({ prRef: "octo/demo#1", lane: "ignore" });
  });

  it("rejects bad references and lanes", async () => {
    const ctx = testContext();
    const call = appFor(ctx);
    const { headers } = await signIn(ctx, "ios");
    expect((await call("/v1/triage/nonsense", post({ lane: "fyi" }, headers))).status).toBe(422);
    expect((await call(`/v1/triage/${encoded}`, post({ lane: "later" }, headers))).status).toBe(422);
  });
});

const GH = "https://api.github.com";
const SEARCH = `${GH}/search/issues?q=`;
const query = (q: string) => `${SEARCH}${encodeURIComponent(q)}`;

const searchItem = (repo: string, number: number, updated: string, extra: Record<string, unknown> = {}) => ({
  number,
  title: `PR ${number}`,
  state: "open",
  draft: false,
  user: { login: "someone" },
  updated_at: updated,
  repository_url: `${GH}/repos/${repo}`,
  pull_request: { merged_at: null },
  ...extra,
});

/** Inbox order: acme/api#3, acme/api#1, acme/web#2, me/tool#4. */
const mockInbox = (ctx: TestContext) =>
  ctx.net
    .on("GET", query("is:pr is:open archived:false review-requested:@me"), {
      total_count: 2,
      items: [searchItem("acme/api", 1, "2026-10-27T10:00:00Z"), searchItem("acme/web", 2, "2026-10-27T09:00:00Z")],
    })
    .on("GET", query("is:pr is:open archived:false mentions:@me"), {
      total_count: 1,
      items: [searchItem("acme/api", 3, "2026-10-27T11:00:00Z")],
    })
    .on("GET", query("is:pr is:open archived:false author:@me"), {
      total_count: 1,
      items: [searchItem("me/tool", 4, "2026-10-26T08:00:00Z", { draft: true })],
    });

const CLEAN_FILES = [
  { filename: "src/sync.ts", status: "modified", additions: 5, deletions: 1, patch: "run();" },
  { filename: "test/sync.test.ts", status: "added", additions: 2, deletions: 0, patch: "+test" },
];
const UNTESTED_FILES = [{ filename: "src/sync.ts", status: "modified", additions: 5, deletions: 1, patch: "run();" }];

const stubPr = (
  ctx: TestContext,
  repo: string,
  n: number,
  opts: { files?: unknown[]; login?: string; draft?: boolean; sha?: string; body?: string } = {},
) => {
  const sha = opts.sha ?? `sha${n}`;
  ctx.net
    .on("GET", `${GH}/repos/${repo}/pulls/${n}`, {
      number: n,
      title: `PR ${n}`,
      body: opts.body ?? "Body.",
      state: "open",
      draft: opts.draft ?? false,
      merged_at: null,
      user: { login: opts.login ?? "someone" },
      base: { ref: "main" },
      head: { ref: "feat/x", sha },
      additions: 6,
      deletions: 1,
      changed_files: 1,
      created_at: "2026-10-26T10:00:00Z",
      updated_at: "2026-10-27T10:00:00Z",
      html_url: `https://github.com/${repo}/pull/${n}`,
    })
    .on("GET", `${GH}/repos/${repo}/pulls/${n}/files`, opts.files ?? CLEAN_FILES)
    .on("GET", `${GH}/repos/${repo}/commits/${sha}/check-runs`, { check_runs: [] })
    .on("GET", `${GH}/repos/${repo}/commits/${sha}/status`, { statuses: [] })
    .on("GET", `${GH}/repos/${repo}/pulls/${n}/comments`, [])
    .on("GET", `${GH}/repos/${repo}/issues/${n}/comments`, [])
    .on("GET", `${GH}/repos/${repo}/pulls/${n}/commits`, []);
};

/** Clean PRs everywhere except #2 (no tests) and #4 (a draft). */
const stubAll = (ctx: TestContext) => {
  mockInbox(ctx);
  stubPr(ctx, "acme/api", 1);
  stubPr(ctx, "acme/web", 2, { files: UNTESTED_FILES });
  stubPr(ctx, "acme/api", 3);
  stubPr(ctx, "me/tool", 4, { draft: true });
};

const putJson = (body: unknown, headers: Record<string, string>): RequestInit => ({ ...post(body, headers), method: "PUT" });

const grantConsent = async (ctx: TestContext, headers: Record<string, string>) =>
  expect((await appFor(ctx)("/v1/consent", putJson({ ai: { granted: true, version: "2" } }, headers))).status).toBe(200);

type Answer = { lane: string; reasons: string[] } | string;

/** Fake Workers AI that answers per pull request title, e.g. "PR 3". */
const modelFor = (answers: Record<number, Answer>) =>
  fakeAi(async (run: AiRun) => {
    const messages = (run.inputs as { messages: { content: string }[] }).messages;
    const prompt = messages.map((m) => m.content).join("\n");
    const n = Number(/Title: PR (\d+)/.exec(prompt)?.[1]);
    const answer = answers[n] ?? { lane: "fyi", reasons: ["Looks routine."] };
    return { response: typeof answer === "string" ? answer : JSON.stringify(answer) };
  });

const queue = async (ctx: TestContext, headers: Record<string, string>) => {
  const res = await appFor(ctx)("/v1/triage", { headers });
  expect(res.status).toBe(200);
  return TriageQueue.parse(await res.json());
};

const laneOf = (items: TriageItem[], prRef: string) => items.find((i) => i.prRef === prRef);

describe("real triage queue", () => {
  it("builds the queue from the inbox in inbox order with rules lanes and reasons, using the user's token", async () => {
    const ai = fakeAi();
    const ctx = testContext({ ...validModelEnv(), AI: ai });
    const { headers } = await signIn(ctx);
    stubAll(ctx);
    const items = await queue(ctx, headers);
    expect(items.map((i) => [i.prRef, i.lane, i.source])).toEqual([
      ["acme/api#3", "fyi", "rules"],
      ["acme/api#1", "fyi", "rules"],
      ["acme/web#2", "needs_you", "rules"],
      ["me/tool#4", "ignore", "rules"],
    ]);
    expect(laneOf(items, "acme/web#2")?.reason).toContain("No tests for the changed logic.");
    expect(laneOf(items, "acme/web#2")?.reasons).toContain("No tests for the changed logic.");
    expect(laneOf(items, "acme/api#3")?.title).toBe("PR 3");
    const prCall = ctx.net.calls.find((c) => c.url === `${GH}/repos/acme/api/pulls/3`);
    expect(prCall?.headers.get("authorization")).toBe("Bearer ghu_testaccess1");
    expect(ai.runs).toHaveLength(0);
  });

  it("flags coding-agent PRs for a closer look", async () => {
    const ctx = testContext();
    const { headers } = await signIn(ctx);
    mockInbox(ctx);
    stubPr(ctx, "acme/api", 1, { login: "helper[bot]" });
    stubPr(ctx, "acme/web", 2);
    stubPr(ctx, "acme/api", 3);
    stubPr(ctx, "me/tool", 4, { draft: true });
    const item = laneOf(await queue(ctx, headers), "acme/api#1");
    expect(item?.lane).toBe("needs_you");
    expect(item?.reasons).toContain("Opened by a bot or app account.");
  });

  it("leaves out pull requests the user cannot access, and keeps the rest", async () => {
    const ctx = testContext();
    const { headers } = await signIn(ctx);
    stubAll(ctx);
    ctx.net.on("GET", `${GH}/repos/acme/web/pulls/2`, () => json({ message: "Not Found" }, 404));
    const items = await queue(ctx, headers);
    expect(items.map((i) => i.prRef)).toEqual(["acme/api#3", "acme/api#1", "me/tool#4"]);
  });

  it("keeps an item with a cautious lane when GitHub hiccups on it", async () => {
    const ctx = testContext();
    const { headers } = await signIn(ctx);
    stubAll(ctx);
    ctx.net.on("GET", `${GH}/repos/acme/api/pulls/1`, () => json({ message: "boom" }, 500));
    const item = laneOf(await queue(ctx, headers), "acme/api#1");
    expect(item).toMatchObject({ lane: "fyi", source: "rules", reason: "Details unavailable right now." });
  });

  it("applies the inbox rules: muted repositories, done and snoozed items are left out", async () => {
    const ctx = testContext();
    const { headers, userId } = await signIn(ctx);
    stubAll(ctx);
    ctx.db.sqlite
      .prepare("INSERT INTO repo_watch (user_id, repo_id, full_name, watching, updated_at) VALUES (?, '5', 'acme/web', 0, 'x')")
      .run(userId);
    const inbox = (await (await appFor(ctx)("/v1/notifications", { headers })).json()) as { items: { id: string; repo: string; number: number }[] };
    const one = inbox.items.find((n) => n.repo === "acme/api" && n.number === 1);
    await appFor(ctx)(`/v1/notifications/${one?.id}/done`, { method: "POST", headers });
    expect((await queue(ctx, headers)).map((i) => i.prRef)).toEqual(["acme/api#3", "me/tool#4"]);
  });

  it("caps the queue at 25 items", async () => {
    const ctx = testContext();
    const { headers } = await signIn(ctx);
    const many = Array.from({ length: 60 }, (_, i) =>
      searchItem("acme/big", i + 100, new Date(Date.UTC(2026, 9, 27, 0, 0, 59 - (i % 60))).toISOString()),
    );
    ctx.net
      .on("GET", query("is:pr is:open archived:false review-requested:@me"), { total_count: 60, items: many.slice(0, 50) })
      .on("GET", query("is:pr is:open archived:false mentions:@me"), { total_count: 0, items: [] })
      .on("GET", query("is:pr is:open archived:false author:@me"), { total_count: 0, items: [] });
    for (let i = 0; i < 50; i += 1) stubPr(ctx, "acme/big", i + 100);
    expect(await queue(ctx, headers)).toHaveLength(25);
  });
});

describe("triage choices", () => {
  it("persists choices in D1 across fresh app instances and removes triaged items from the queue", async () => {
    const ctx = testContext();
    const { headers, userId } = await signIn(ctx);
    stubAll(ctx);
    const first = createApp(ctx.deps);
    const res = await first.request(`/v1/triage/${encodeURIComponent("acme/api#1")}`, post({ lane: "needs_you" }, headers), ctx.env);
    expect(res.status).toBe(200);
    expect(TriageRecord.parse(await res.json())).toEqual({ prRef: "acme/api#1", lane: "needs_you" });
    expect(ctx.db.rows("SELECT user_id, lane FROM triage_choices")).toEqual([{ user_id: userId, lane: "needs_you" }]);

    // A different app instance sees the same choice, because it lives in D1.
    const second = createApp(ctx.deps);
    const out = TriageQueue.parse(await (await second.request("/v1/triage", { headers }, ctx.env)).json());
    expect(out.map((i) => i.prRef)).toEqual(["acme/api#3", "acme/web#2", "me/tool#4"]);

    // Changing the choice updates the same row.
    await second.request(`/v1/triage/${encodeURIComponent("acme/api#1")}`, post({ lane: "ignore" }, headers), ctx.env);
    expect(ctx.db.rows("SELECT lane FROM triage_choices")).toEqual([{ lane: "ignore" }]);
  });

  it("keeps choices per user and ignores any client-sent user id", async () => {
    const ctx = testContext();
    const a = await signIn(ctx);
    const b = await signIn(ctx, "ios", { id: 9, login: "other", name: null, avatar_url: "https://avatars.githubusercontent.com/u/9" });
    stubAll(ctx);
    const body = { lane: "fyi", userId: b.userId, user_id: b.userId };
    expect((await appFor(ctx)(`/v1/triage/${encodeURIComponent("acme/api#1")}`, post(body, a.headers))).status).toBe(200);
    expect(ctx.db.rows<{ user_id: string }>("SELECT user_id FROM triage_choices")).toEqual([{ user_id: a.userId }]);
    expect((await queue(ctx, b.headers)).map((i) => i.prRef)).toContain("acme/api#1");
    expect((await queue(ctx, a.headers)).map((i) => i.prRef)).not.toContain("acme/api#1");
  });

  it("matches repository names regardless of case", async () => {
    const ctx = testContext();
    const { headers } = await signIn(ctx);
    stubAll(ctx);
    await appFor(ctx)(`/v1/triage/${encodeURIComponent("ACME/API#1")}`, post({ lane: "fyi" }, headers));
    expect((await queue(ctx, headers)).map((i) => i.prRef)).not.toContain("acme/api#1");
  });

  it("removes choices and triage usage when the account is deleted", async () => {
    const ctx = testContext();
    const { headers, userId } = await signIn(ctx);
    ctx.net.on("DELETE", `${GH}/applications/Iv-test-client/grant`, () => new Response(null, { status: 204 }));
    await appFor(ctx)(`/v1/triage/${encodeURIComponent("acme/api#1")}`, post({ lane: "fyi" }, headers));
    ctx.db.sqlite.prepare("INSERT INTO ai_usage_daily (scope, day, used) VALUES (?, '2026-10-27', 1)").run(`${userId}:triage`);
    expect(ctx.db.rows("SELECT * FROM triage_choices")).toHaveLength(1);
    expect((await appFor(ctx)("/v1/account", { method: "DELETE", headers })).status).toBe(204);
    expect(ctx.db.rows("SELECT * FROM triage_choices")).toEqual([]);
    expect(ctx.db.rows("SELECT * FROM ai_usage_daily WHERE scope = ?", `${userId}:triage`)).toEqual([]);
  });

  it("does not let demo sessions write or read stored choices", async () => {
    const ctx = testContext();
    const demo = await demoHeaders(ctx);
    expect((await appFor(ctx)(`/v1/triage/${encodeURIComponent("acme/api#1")}`, post({ lane: "fyi" }, demo))).status).toBe(403);
    expect(ctx.db.rows("SELECT * FROM triage_choices")).toEqual([]);
    const res = await appFor(ctx)("/v1/triage", { headers: demo });
    expect(TriageQueue.parse(await res.json()).map((i) => i.prRef)).toEqual(["octo/demo#7", "octo/demo#9"]);
    expect(ctx.net.calls).toHaveLength(0);
  });
});

describe("AI lane scoring", () => {
  it("raises fyi to needs_you, never lowers needs_you, and does not spend on needs_you", async () => {
    const ai = modelFor({
      1: { lane: "needs_you", reasons: ["Changes how payments retry."] },
      2: { lane: "ignore", reasons: ["Looks trivial."] },
      3: { lane: "ignore", reasons: ["Looks trivial."] },
    });
    const ctx = testContext({ ...validModelEnv(), AI: ai });
    const { headers } = await signIn(ctx);
    stubAll(ctx);
    await grantConsent(ctx, headers);
    const items = await queue(ctx, headers);
    expect(laneOf(items, "acme/api#1")).toMatchObject({
      lane: "needs_you",
      source: "ai",
      reason: "Changes how payments retry.",
    });
    expect(laneOf(items, "acme/api#1")?.reasons).toEqual(["No risk signals.", "Changes how payments retry."]);
    // The rules already say needs_you: kept, and the model is not asked.
    expect(laneOf(items, "acme/web#2")).toMatchObject({ lane: "needs_you", source: "rules" });
    // A model "ignore" never lowers a fyi.
    expect(laneOf(items, "acme/api#3")).toMatchObject({ lane: "fyi", source: "ai" });
    // The draft is asked too; a fyi answer raises ignore.
    expect(laneOf(items, "me/tool#4")).toMatchObject({ lane: "fyi", source: "ai" });
    expect(ai.runs).toHaveLength(3);
    const first = ai.runs[0];
    expect(first?.model).toBe("@cf/meta/llama-3.3-70b-instruct-fp8-fast");
    const messages = (first?.inputs as { messages: { role: string; content: string }[] }).messages;
    expect(messages[0]?.role).toBe("system");
    expect(messages[1]?.content).toMatch(/^<pr_data>\n/);
    expect(messages[0]?.content).not.toContain("Title:");
  });

  it("makes no model call without consent, with the AI setting off, or after consent is withdrawn", async () => {
    const ai = modelFor({ 1: { lane: "needs_you", reasons: ["x"] } });
    const ctx = testContext({ ...validModelEnv(), AI: ai });
    const { headers } = await signIn(ctx);
    stubAll(ctx);
    expect((await queue(ctx, headers)).every((i) => i.source === "rules")).toBe(true);
    expect(ai.runs).toHaveLength(0);

    await grantConsent(ctx, headers);
    expect((await setSummaries(appFor(ctx), headers, false)).status).toBe(200);
    expect((await queue(ctx, headers)).every((i) => i.source === "rules")).toBe(true);
    expect(ai.runs).toHaveLength(0);

    expect((await setSummaries(appFor(ctx), headers, true)).status).toBe(200);
    await appFor(ctx)("/v1/consent", putJson({ ai: { granted: false, version: "2" } }, headers));
    expect((await queue(ctx, headers)).every((i) => i.source === "rules")).toBe(true);
    expect(ai.runs).toHaveLength(0);
  });

  it("stops scoring at the daily cap and still returns every item", async () => {
    const ai = modelFor({ 3: { lane: "needs_you", reasons: ["First in line."] } });
    const ctx = testContext({ ...validModelEnv(), AI: ai, AI_DAILY_TRIAGE_FREE: "1" });
    const { headers, userId } = await signIn(ctx);
    stubAll(ctx);
    await grantConsent(ctx, headers);
    const items = await queue(ctx, headers);
    expect(items).toHaveLength(4);
    expect(ai.runs).toHaveLength(1);
    expect(ctx.db.rows<{ used: number }>("SELECT used FROM ai_usage_daily WHERE scope = ?", `${userId}:triage`)).toEqual([{ used: 1 }]);
    // Triage has its own budget: the user's summary and risk actions are untouched.
    expect(ctx.db.rows("SELECT used FROM ai_usage_daily WHERE scope = ?", userId)).toEqual([]);
    expect(items.filter((i) => i.source === "ai")).toHaveLength(1);
    expect(laneOf(items, "acme/api#1")).toMatchObject({ lane: "fyi", source: "rules" });
    expect(laneOf(items, "me/tool#4")).toMatchObject({ lane: "ignore", source: "rules" });
  });

  it("stops at the global cap too", async () => {
    const ai = modelFor({});
    const ctx = testContext({ ...validModelEnv(), AI: ai, AI_GLOBAL_DAILY_ACTIONS: "2" });
    const { headers } = await signIn(ctx);
    stubAll(ctx);
    await grantConsent(ctx, headers);
    const items = await queue(ctx, headers);
    expect(items).toHaveLength(4);
    expect(ai.runs).toHaveLength(2);
  });

  it("caches AI lanes per user, pull request and head SHA so a refresh does not re-spend", async () => {
    const ai = modelFor({ 1: { lane: "needs_you", reasons: ["Cached reason."] } });
    const ctx = testContext({ ...validModelEnv(), AI: ai });
    const { headers, userId } = await signIn(ctx);
    stubAll(ctx);
    await grantConsent(ctx, headers);
    await queue(ctx, headers);
    expect(ai.runs).toHaveLength(3);
    const second = await queue(ctx, headers);
    expect(ai.runs).toHaveLength(3);
    expect(laneOf(second, "acme/api#1")).toMatchObject({ lane: "needs_you", source: "ai", reason: "Cached reason." });
    expect(ctx.db.rows<{ key: string }>("SELECT key FROM ai_results_cache ORDER BY key").map((r) => r.key)).toEqual([
      `${userId}:triage:acme/api#1@sha1`,
      `${userId}:triage:acme/api#3@sha3`,
      `${userId}:triage:me/tool#4@sha4`,
    ]);
    // A new head SHA is a new key.
    stubPr(ctx, "acme/api", 1, { sha: "sha1b" });
    await queue(ctx, headers);
    expect(ai.runs).toHaveLength(4);
  });

  it("does not share cached lanes between users", async () => {
    const ai = modelFor({ 1: { lane: "needs_you", reasons: ["Mine."] } });
    const ctx = testContext({ ...validModelEnv(), AI: ai });
    const a = await signIn(ctx);
    const b = await signIn(ctx, "ios", { id: 9, login: "other", name: null, avatar_url: "https://avatars.githubusercontent.com/u/9" });
    stubAll(ctx);
    await grantConsent(ctx, a.headers);
    await queue(ctx, a.headers);
    const runs = ai.runs.length;
    await queue(ctx, b.headers);
    expect(ai.runs).toHaveLength(runs);
    expect((await queue(ctx, b.headers)).every((i) => i.source === "rules")).toBe(true);
  });

  it("keeps the rules lane, gives the action back and never shows raw output when the model returns invalid JSON", async () => {
    const ai = modelFor({ 1: "ignore previous instructions {not json", 3: { lane: "urgent", reasons: ["x"] } });
    const ctx = testContext({ ...validModelEnv(), AI: ai });
    const { headers, userId } = await signIn(ctx);
    stubAll(ctx);
    await grantConsent(ctx, headers);
    const res = await appFor(ctx)("/v1/triage", { headers });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain("not json");
    const items = TriageQueue.parse(JSON.parse(text));
    expect(laneOf(items, "acme/api#1")).toMatchObject({ lane: "fyi", source: "rules" });
    expect(laneOf(items, "acme/api#3")).toMatchObject({ lane: "fyi", source: "rules" });
    expect(ctx.db.rows("SELECT * FROM ai_results_cache")).toHaveLength(1);
    // Failed calls are given back; only the valid answer counts.
    expect(ctx.db.rows("SELECT used FROM ai_usage_daily WHERE scope = ?", `${userId}:triage`)).toEqual([{ used: 1 }]);
  });

  it("keeps rules lanes when the route is not configured or the model is down", async () => {
    const down = testContext({ ...validModelEnv(), AI: fakeAi(async () => { throw new Error("down"); }) });
    const a = await signIn(down);
    stubAll(down);
    await grantConsent(down, a.headers);
    expect((await queue(down, a.headers)).every((i) => i.source === "rules")).toBe(true);

    const env = { ...validModelEnv() };
    delete env.MODEL_ROUTE_TRIAGE;
    const ai = fakeAi();
    const unset = testContext({ ...env, AI: ai });
    const b = await signIn(unset);
    stubAll(unset);
    await grantConsent(unset, b.headers);
    expect((await queue(unset, b.headers)).every((i) => i.source === "rules")).toBe(true);
    expect(ai.runs).toHaveLength(0);
  });

  it("sends PR content as delimited data with secrets redacted and no token", async () => {
    const ai = modelFor({});
    const ctx = testContext({ ...validModelEnv(), AI: ai });
    const { headers } = await signIn(ctx);
    mockInbox(ctx);
    // Patches with secrets are flagged by the rules and never sent; the title and description are
    // not scanned, so redaction is what keeps a secret there from reaching the model.
    const secret = `api_key = "${"k".repeat(20)}"`;
    stubPr(ctx, "acme/api", 1);
    stubPr(ctx, "acme/web", 2, { files: UNTESTED_FILES });
    stubPr(ctx, "acme/api", 3, { body: secret });
    stubPr(ctx, "me/tool", 4, { draft: true });
    await grantConsent(ctx, headers);
    await queue(ctx, headers);
    const sent = JSON.stringify(ai.runs.map((r) => r.inputs));
    expect(sent).not.toContain("k".repeat(20));
    expect(sent).toContain("[REDACTED]");
    expect(sent).not.toContain("ghu_");
  });
});

 it('does not change the decision timestamp when the same choice is replayed',async()=>{
  const ctx=testContext();const {headers}=await signIn(ctx);const call=appFor(ctx);const path='/v1/triage/'+encodeURIComponent('acme/api#1');
  await call(path,post({lane:'fyi'},headers));const first=ctx.db.rows('SELECT lane,decided_at FROM triage_choices');
  ctx.time.advance(1000);await call(path,post({lane:'fyi'},headers));expect(ctx.db.rows('SELECT lane,decided_at FROM triage_choices')).toEqual(first);
 });
