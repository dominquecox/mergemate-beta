import { describe, expect, it } from "vitest";
import { testContext } from "./helpers";
import { appFor, ghUser, post, signIn } from "./sign-in";
import { consumeGitHubEvents, toWebhookData, type GitHubEventMessage } from "../src/lib/github-webhooks";
import { VerifyLater, verifyMerge, verifyMergedPullRequest, type MergedPull, type VerifierGitHub } from "../src/brain/verifier";
import { ApiError } from "../src/errors";

const HEAD = "a".repeat(40), MERGE = "b".repeat(40), TREE = "c".repeat(40);
const goodBody = `Exact head: \`${HEAD}\`\n- \`npm run check\`: exit 0. API 761.`;
const pull = (over: Partial<MergedPull> = {}): MergedPull => ({ merged: true, mergeCommitSha: MERGE, headSha: HEAD, headRef: "feat/x", body: goodBody, ...over });

describe("verifyMerge checks", () => {
  it("passes when the merged head, tree, branch and gates all match", () => {
    expect(verifyMerge({ head: HEAD, branch: "feat/x" }, pull(), { head: TREE, merge: TREE })).toEqual([]);
    expect(verifyMerge({ head: HEAD, branch: null }, pull(), { head: TREE, merge: TREE })).toEqual([]);
  });

  it("fails each check on its own", () => {
    const trees = { head: TREE, merge: TREE };
    expect(verifyMerge({ head: "d".repeat(40), branch: null }, pull(), trees).join(" ")).toMatch(/not the validated head/);
    expect(verifyMerge({ head: null, branch: null }, pull(), trees).join(" ")).toMatch(/no validated head/);
    expect(verifyMerge({ head: HEAD, branch: null }, pull(), { head: TREE, merge: "e".repeat(40) }).join(" ")).toMatch(/tree differs/);
    expect(verifyMerge({ head: HEAD, branch: "feat/y" }, pull(), trees).join(" ")).toMatch(/not the card's branch/);
    expect(verifyMerge({ head: HEAD, branch: null }, pull({ body: "`npm run check`: exit 0" }), trees).join(" ")).toMatch(/exact head SHA/);
    expect(verifyMerge({ head: HEAD, branch: null }, pull({ body: `head ${HEAD}; check exit 1` }), trees).join(" ")).toMatch(/exit 0/);
    expect(verifyMerge({ head: HEAD, branch: null }, pull({ merged: false, mergeCommitSha: null }), null).join(" ")).toMatch(/not report this PR as merged/);
    expect(verifyMerge({ head: HEAD, branch: null }, pull({ body: `${HEAD}\nnpm run check failed, expected exit 0` }), trees).join(" ")).toMatch(/exit 0/);
    expect(verifyMerge({ head: HEAD, branch: null }, pull({ body: `${HEAD}\n\`npm run check\` (typecheck, lint, tests): exit 0` }), trees)).toEqual([]);
  });
});

describe("merge webhook data", () => {
  it("keeps the merge ids for a merged PR and nothing for an unmerged close", () => {
    const payload = (merged: boolean) => ({
      action: "closed", repository: { id: 42, full_name: "acme/api" },
      pull_request: { number: 7, merged, merge_commit_sha: MERGE, head: { sha: HEAD, ref: "feat/x" }, body: "not kept" },
    });
    const data = toWebhookData("pull_request", payload(true));
    expect(data).toMatchObject({ kind: "pr", numbers: [7], merge: { repoId: 42, mergeCommitSha: MERGE, headRef: "feat/x" } });
    expect(JSON.stringify(data)).not.toContain("not kept");
    expect(toWebhookData("pull_request", payload(false))).not.toHaveProperty("merge");
  });
});

async function board(flag = true) {
  const ctx = testContext();
  const call = appFor(ctx), owner = await signIn(ctx);
  ctx.kv.set("flags:v1", JSON.stringify({ brain: true }));
  const project = ((await (await call("/v1/brain/projects", post({ owner: "Acme", repo: "api" }, owner.headers))).json()) as { project: { id: string } }).project;
  const card = ((await (await call("/v1/brain/cards", post({ projectId: project.id, title: "t", details: "d", priority: "P1", doneWhen: "merged" }, owner.headers))).json()) as { card: { id: string } }).card;
  await ctx.db.prepare("UPDATE brain_cards SET pr_number=7,head=?,branch='feat/x',status='review' WHERE id=?").bind(HEAD, card.id).run();
  await ctx.db.prepare("INSERT OR IGNORE INTO user_repo_access(user_id,full_name) VALUES(?,'acme/api')").bind(owner.userId).run();
  // A fresh access check, so the verifier's re-check needs no GitHub call.
  await ctx.db.prepare("INSERT INTO user_access_checks(user_id,checked_at) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET checked_at=excluded.checked_at").bind(owner.userId, ctx.time.now().toISOString()).run();
  if (!flag) ctx.kv.set("flags:v1", JSON.stringify({ brain: false }));
  return { ctx, card, call, owner };
}

const fakeGitHub = (p: MergedPull, trees: Record<string, string>, calls: string[] = []) => async (): Promise<VerifierGitHub> => ({
  pull: async (repo, number) => { calls.push(`pull ${repo}#${number}`); return p; },
  commitTree: async (_repo, sha) => { calls.push(`tree ${sha}`); return trees[sha] ?? "f".repeat(40); },
  done: async () => { calls.push("done"); },
});
const input = (deliveryId = "d1") => ({ deliveryId, repo: "acme/api", number: 7, merge: { repoId: 42, mergeCommitSha: MERGE, headRef: "feat/x" } });
const events = (ctx: ReturnType<typeof testContext>) => ctx.db.rows<{ kind: string; actor: string; text: string; id: string }>("SELECT id,kind,actor,text FROM brain_events WHERE kind='verified'");

describe("verifyMergedPullRequest", () => {
  it("records one PASS on the linked card, marks it merged, and is idempotent per delivery", async () => {
    const { ctx, card } = await board(), calls: string[] = [];
    await ctx.db.prepare("INSERT INTO brain_agent_tokens(id,project_id,name,tool,token_hash,created_at) SELECT 't1',project_id,'A','codex','h1',? FROM brain_cards WHERE id=?").bind(ctx.time.now().toISOString(), card.id).run();
    await ctx.db.prepare("INSERT INTO brain_locks(card_id,project_id,token_id,agent,tool,since,expires_at) SELECT id,project_id,'t1','A','codex',?,? FROM brain_cards WHERE id=?").bind(ctx.time.now().toISOString(), new Date(ctx.time.now().getTime() + 600000).toISOString(), card.id).run();
    const gh = fakeGitHub(pull(), { [HEAD]: TREE, [MERGE]: TREE }, calls);
    await verifyMergedPullRequest(ctx.env, ctx.deps, input(), gh);
    await verifyMergedPullRequest(ctx.env, ctx.deps, input(), gh);
    const rows = events(ctx);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actor: "verifier" });
    expect(rows[0]?.text).toMatch(/^PASS: PR #7/);
    expect(rows[0]?.id.length).toBeLessThanOrEqual(64);
    expect(ctx.db.rows<{ status: string }>("SELECT status FROM brain_cards WHERE id=?", card.id)[0]?.status).toBe("merged");
    expect(ctx.db.rows("SELECT * FROM brain_locks WHERE card_id=?", card.id)).toEqual([]);
    expect(calls).toContain("done");
  });

  it("records a FAIL with the reason when the merged tree is not the validated one", async () => {
    const { ctx } = await board();
    await verifyMergedPullRequest(ctx.env, ctx.deps, input(), fakeGitHub(pull(), { [HEAD]: TREE, [MERGE]: "e".repeat(40) }));
    expect(events(ctx)[0]?.text).toMatch(/^FAIL: .*tree differs/);
  });

  it("records a FAIL when GitHub cannot be read, without throwing", async () => {
    const { ctx } = await board();
    await verifyMergedPullRequest(ctx.env, ctx.deps, input(), async () => { throw new Error("no app"); });
    expect(events(ctx)[0]?.text).toMatch(/^FAIL: .*could not read this PR/);
  });

  it("does nothing while the brain flag is off or when no card is linked", async () => {
    const off = await board(false), calls: string[] = [];
    await verifyMergedPullRequest(off.ctx.env, off.ctx.deps, input(), fakeGitHub(pull(), {}, calls));
    expect(events(off.ctx)).toEqual([]);
    const on = await board();
    await verifyMergedPullRequest(on.ctx.env, on.ctx.deps, { ...input(), number: 8 }, fakeGitHub(pull(), {}, calls));
    expect(events(on.ctx)).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("runs from the GitHub queue consumer after the event is applied, and still acks the event", async () => {
    const { ctx } = await board();
    const acked: string[] = [], retried: string[] = [];
    const body: GitHubEventMessage = { deliveryId: "q1", event: "pull_request", receivedAt: ctx.time.now().toISOString(),
      data: { kind: "pr", installationId: "9", repo: "acme/api", numbers: [7], headSha: HEAD, event: "closed", merge: { repoId: 42, mergeCommitSha: MERGE, headRef: "feat/x" } } };
    const batch = { messages: [{ body, attempts: 1, ack: () => acked.push("q1"), retry: () => retried.push("q1") }], retryAll: () => undefined } as unknown as MessageBatch<GitHubEventMessage>;
    await consumeGitHubEvents(batch, ctx.env, ctx.time.now(), ctx.deps);
    expect(acked).toEqual(["q1"]);
    expect(retried).toEqual([]);
    // No GitHub App is configured in tests, so the verifier records why it could not check.
    expect(events(ctx)[0]?.text).toMatch(/^FAIL: .*could not read this PR/);
  });

  it("ignores a board for the same repo whose owner cannot read it", async () => {
    const { ctx, call } = await board();
    const other = await signIn(ctx, "ios", { ...ghUser, id: ghUser.id + 1, login: "other-user" });
    const project = ((await (await call("/v1/brain/projects", post({ owner: "acme", repo: "api" }, other.headers))).json()) as { project: { id: string } }).project;
    const card = ((await (await call("/v1/brain/cards", post({ projectId: project.id, title: "spy", details: "d", priority: "P1", doneWhen: "w" }, other.headers))).json()) as { card: { id: string } }).card;
    await ctx.db.prepare("UPDATE brain_cards SET pr_number=7,head=?,branch='guess' WHERE id=?").bind(HEAD, card.id).run();
    await verifyMergedPullRequest(ctx.env, ctx.deps, input(), fakeGitHub(pull(), { [HEAD]: TREE, [MERGE]: TREE }));
    const rows = ctx.db.rows<{ card_id: string }>("SELECT card_id FROM brain_events WHERE kind='verified'");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.card_id).not.toBe(card.id);
    expect(ctx.db.rows<{ status: string }>("SELECT status FROM brain_cards WHERE id=?", card.id)[0]?.status).toBe("open");
  });

  it("re-checks a stale access list with GitHub and skips an owner who lost the repository", async () => {
    const { ctx, owner } = await board();
    await ctx.db.prepare("UPDATE user_access_checks SET checked_at=? WHERE user_id=?").bind("2020-01-01T00:00:00.000Z", owner.userId).run();
    ctx.net.on("GET", "https://api.github.com/user/installations", { installations: [{ id: 22, suspended_at: null }] })
      .on("GET", "https://api.github.com/user/installations/22/repositories", { total_count: 1, repositories: [{ full_name: "acme/other" }] });
    await verifyMergedPullRequest(ctx.env, ctx.deps, input(), fakeGitHub(pull(), { [HEAD]: TREE, [MERGE]: TREE }));
    expect(events(ctx)).toEqual([]);
    expect(ctx.db.rows("SELECT * FROM user_repo_access WHERE user_id=? AND full_name='acme/api'", owner.userId)).toEqual([]);
  });

  it("skips an owner whose access cannot be re-checked", async () => {
    const { ctx, owner } = await board();
    await ctx.db.prepare("UPDATE user_access_checks SET checked_at=? WHERE user_id=?").bind("2020-01-01T00:00:00.000Z", owner.userId).run();
    await verifyMergedPullRequest(ctx.env, ctx.deps, input(), fakeGitHub(pull(), { [HEAD]: TREE, [MERGE]: TREE }));
    expect(events(ctx)).toEqual([]);
  });

  it("asks the queue to retry a GitHub read that failed, and records a FAIL only on the last attempt", async () => {
    const { ctx } = await board();
    const broken = async (): Promise<VerifierGitHub> => { throw new Error("GitHub 502"); };
    await expect(verifyMergedPullRequest(ctx.env, ctx.deps, { ...input(), attempt: 1 }, broken)).rejects.toBeInstanceOf(VerifyLater);
    expect(events(ctx)).toEqual([]);
    await verifyMergedPullRequest(ctx.env, ctx.deps, { ...input(), attempt: 3 }, broken);
    expect(events(ctx)[0]?.text).toMatch(/^FAIL: .*could not read this PR/);
  });

  it("records a FAIL at once when the GitHub App is not configured", async () => {
    const { ctx } = await board();
    await verifyMergedPullRequest(ctx.env, ctx.deps, { ...input(), attempt: 1 }, async () => { throw new ApiError("misconfigured", "no app"); });
    expect(events(ctx)[0]?.text).toMatch(/^FAIL:/);
  });
});
