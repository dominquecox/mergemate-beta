import { NotificationPage } from "@mergemate/contracts";
import { describe, expect, it } from "vitest";
import { type TestContext, testContext } from "./helpers";
import { appFor, post, signIn } from "./sign-in";

const SEARCH = "https://api.github.com/search/issues?q=";

const item = (repo: string, number: number, updated: string, extra: Record<string, unknown> = {}) => ({
  number,
  title: `PR ${number}`,
  state: "open",
  draft: false,
  user: { login: "someone" },
  updated_at: updated,
  repository_url: `https://api.github.com/repos/${repo}`,
  pull_request: { merged_at: null },
  ...extra,
});

const mockSearch = (ctx: TestContext, total = 3) =>
  ctx.net
    .on("GET", `${SEARCH}${encodeURIComponent("is:pr is:open archived:false review-requested:@me")}`, {
      total_count: total,
      items: [item("acme/api", 1, "2026-10-27T10:00:00Z"), item("acme/web", 2, "2026-10-27T09:00:00Z")],
    })
    .on("GET", `${SEARCH}${encodeURIComponent("is:pr is:open archived:false mentions:@me")}`, {
      total_count: 2,
      items: [item("acme/api", 1, "2026-10-27T10:00:00Z"), item("acme/api", 3, "2026-10-27T11:00:00Z")],
    })
    .on("GET", `${SEARCH}${encodeURIComponent("is:pr is:open archived:false author:@me")}`, {
      total_count: 1,
      items: [item("me/tool", 4, "2026-10-26T08:00:00Z", { draft: true })],
    });

const list = async (ctx: TestContext, headers: Record<string, string>, query = "") =>
  NotificationPage.parse(await (await appFor(ctx)(`/v1/notifications${query}`, { headers })).json());

describe("GET /v1/notifications", () => {
  it("merges review requests, mentions and my PRs, newest first, without duplicates", async () => {
    const ctx = testContext();
    const { headers } = await signIn(ctx);
    mockSearch(ctx);
    const page = await list(ctx, headers);
    expect(page.items.map((n) => [n.repo, n.number, n.kind, n.status])).toEqual([
      ["acme/api", 3, "mention", "open"],
      ["acme/api", 1, "review", "open"],
      ["acme/web", 2, "review", "open"],
      ["me/tool", 4, "mine", "draft"],
    ]);
    expect(page.nextCursor).toBeNull();
  });

  it("runs only the query for a filter and pages with a cursor", async () => {
    const ctx = testContext();
    const { headers } = await signIn(ctx);
    mockSearch(ctx, 120);
    const before = ctx.net.calls.length;
    const page = await list(ctx, headers, "?filter=review");
    expect(ctx.net.calls.length - before).toBe(1);
    expect(page.items.every((n) => n.kind === "review")).toBe(true);
    expect(page.nextCursor).toEqual(expect.any(String));
    expect(page.nextCursor).not.toBe("2");
    expect((await list(ctx,headers,`?filter=review&cursor=${encodeURIComponent(page.nextCursor??"")}`)).items.length).toBeGreaterThan(0);
    expect((await appFor(ctx)("/v1/notifications?filter=bogus", { headers })).status).toBe(422);
  });

  it("hides done items until they change, and snoozed items until the time passes", async () => {
    const ctx = testContext();
    const { headers } = await signIn(ctx);
    mockSearch(ctx);
    const call = appFor(ctx);
    const [first, second] = (await list(ctx, headers)).items;

    expect((await call(`/v1/notifications/${first?.id}/done`, { method: "POST", headers })).status).toBe(204);
    const until = new Date(ctx.time.now().getTime() + 60 * 60 * 1000).toISOString();
    expect((await call(`/v1/notifications/${second?.id}/snooze`, post({ until }, headers))).status).toBe(204);
    expect((await list(ctx, headers)).items.map((n) => n.id)).not.toContain(first?.id);
    expect((await list(ctx, headers)).items.map((n) => n.id)).not.toContain(second?.id);

    ctx.time.advance(60 * 60 * 1000 + 1);
    expect((await list(ctx, headers)).items.map((n) => n.id)).toContain(second?.id);

    // Undo brings a done item back.
    expect((await call(`/v1/notifications/${first?.id}/restore`, { method: "POST", headers })).status).toBe(204);
    expect((await list(ctx, headers)).items.map((n) => n.id)).toContain(first?.id);
  });

  it("brings a done item back when the pull request is updated later", async () => {
    const ctx = testContext();
    const { headers } = await signIn(ctx);
    mockSearch(ctx);
    const first = (await list(ctx, headers)).items[0];
    await appFor(ctx)(`/v1/notifications/${first?.id}/done`, { method: "POST", headers });
    ctx.net.on("GET", `${SEARCH}${encodeURIComponent("is:pr is:open archived:false mentions:@me")}`, {
      total_count: 1,
      items: [item("acme/api", 3, "2026-10-27T13:00:00Z")],
    });
    expect((await list(ctx, headers)).items.map((n) => n.id)).toContain(first?.id);
  });

  it("keeps each user's done state separate", async () => {
    const ctx = testContext();
    const a = await signIn(ctx);
    const b = await signIn(ctx, "ios", { id: 9, login: "other", name: null, avatar_url: "https://avatars.githubusercontent.com/u/9" });
    mockSearch(ctx);
    const first = (await list(ctx, a.headers)).items[0];
    await appFor(ctx)(`/v1/notifications/${first?.id}/done`, { method: "POST", headers: a.headers });
    expect((await list(ctx, b.headers)).items.map((n) => n.id)).toContain(first?.id);
  });

  it("leaves out repositories the user stopped watching", async () => {
    const ctx = testContext();
    const { headers, userId } = await signIn(ctx);
    mockSearch(ctx);
    ctx.db.sqlite
      .prepare("INSERT INTO repo_watch (user_id, repo_id, full_name, watching, updated_at) VALUES (?, '5', 'acme/web', 0, 'x')")
      .run(userId);
    expect((await list(ctx, headers)).items.map((n) => n.repo)).not.toContain("acme/web");
  });

  it("rejects snoozes in the past and malformed ids", async () => {
    const ctx = testContext();
    const { headers } = await signIn(ctx);
    const call = appFor(ctx);
    expect((await call("/v1/notifications/abcdefgh/snooze", post({ until: "2026-01-01T00:00:00Z" }, headers))).status).toBe(422);
    expect((await call("/v1/notifications/a%27%3B--/done", { method: "POST", headers })).status).toBe(422);
  });
});

 it('repeated done and snooze requests preserve their first state timestamps',async()=>{
  const ctx=testContext();const {headers}=await signIn(ctx);const call=appFor(ctx);
  const path='/v1/notifications/abcdefgh';
  await call(path+'/done',post({observedUpdatedAt:'2026-10-27T10:00:00Z'},headers));const initial=ctx.db.rows('SELECT done_at,updated_at FROM notification_state');
  ctx.time.advance(1000);await call(path+'/done',post({observedUpdatedAt:'2026-10-27T10:00:00Z'},headers));expect(ctx.db.rows('SELECT done_at,updated_at FROM notification_state')).toEqual(initial);
  await call(path+'/done',post({observedUpdatedAt:'2026-10-27T11:00:00Z'},headers));expect(ctx.db.rows<{done_at:string}>('SELECT done_at FROM notification_state')[0]?.done_at).toBe('2026-10-27T11:00:00Z');
  const body={until:'2026-10-28T18:00:00Z'};await call(path+'/snooze',post(body,headers));const snoozed=ctx.db.rows('SELECT snoozed_until,updated_at FROM notification_state');
  ctx.time.advance(1000);await call(path+'/snooze',post(body,headers));expect(ctx.db.rows('SELECT snoozed_until,updated_at FROM notification_state')).toEqual(snoozed);
 });
 it('rejects invalid page limits and search text before GitHub',async()=>{
  const ctx=testContext();const {headers}=await signIn(ctx);const call=appFor(ctx);
  for(const query of ['limit=0','limit=51','search=%00'])expect((await call('/v1/notifications?'+query,{headers})).status).toBe(422);
 });

 it('searches title, repository and author within each accessible page',async()=>{
  const ctx=testContext();const {headers}=await signIn(ctx);mockSearch(ctx);
  const page=await list(ctx,headers,'?search=me%2Ftool');expect(page.items.map(item=>item.repo)).toEqual(['me/tool']);
  expect(page.nextCursor).toBeNull();
 });
