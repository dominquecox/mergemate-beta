import { describe, expect, it } from "vitest";
import { testContext } from "./helpers";
import { appFor, post, signIn, ghUser } from "./sign-in";

const on = (ctx: ReturnType<typeof testContext>) => ctx.kv.set("flags:v1", JSON.stringify({ brain: true }));
interface Res {
  project: { id: string }; card: { id: string }; token: { id: string }; secret: string; rules: string;
  lock: { cardId: string; agent: string; tool: string; since: string; expiresAt: string };
}
const json = async (res: Response) => (await res.json()) as Res;

async function setup() {
  const ctx = testContext(); on(ctx);
  const call = appFor(ctx), owner = await signIn(ctx);
  const project = (await json(await call("/v1/brain/projects", post({ owner: "acme", repo: "api" }, owner.headers)))).project;
  const card = async (title: string) => (await json(await call("/v1/brain/cards", post({ projectId: project.id, title, details: "d", priority: "P1", doneWhen: "merged" }, owner.headers)))).card;
  const token = async (name: string, tool = "codex") => (await json(await call(`/v1/brain/projects/${project.id}/tokens`, post({ name, tool }, owner.headers))));
  const agent = (secret: string) => ({ authorization: `Bearer ${secret}` });
  return { ctx, call, owner, project, card, token, agent };
}

describe("brain API", () => {
  it("is not reachable while the brain flag is off", async () => {
    const ctx = testContext(), call = appFor(ctx), owner = await signIn(ctx);
    expect((await call("/v1/brain/projects", { headers: owner.headers })).status).toBe(404);
    expect((await call("/agent/v1/brain/board", { headers: { authorization: "Bearer mmb_" + "a".repeat(43) } })).status).toBe(404);
  });

  it("keeps each project private to its owner", async () => {
    const { ctx, call, project } = await setup();
    const other = await signIn(ctx, "ios", { ...ghUser, id: ghUser.id + 1, login: "other-user" });
    expect((await call(`/v1/brain/projects/${project.id}`, { headers: other.headers })).status).toBe(404);
    expect((await call("/v1/brain/cards", post({ projectId: project.id, title: "x", details: "d", priority: "P1", doneWhen: "w" }, other.headers))).status).toBe(404);
  });

  it("shows an agent secret once and stores only its hash", async () => {
    const { ctx, call, owner, project, token } = await setup();
    const created = await token("Agent A");
    expect(created.secret).toMatch(/^mmb_[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(created.token)).not.toContain(created.secret);
    const stored = ctx.db.rows<{ token_hash: string }>("SELECT token_hash FROM brain_agent_tokens");
    expect(stored).toHaveLength(1);
    expect(stored[0]?.token_hash).not.toContain(created.secret);
    const listed = await json(await call(`/v1/brain/projects/${project.id}/tokens`, { headers: owner.headers }));
    expect(JSON.stringify(listed)).not.toMatch(/mmb_|hash/);
  });

  it("proceeds with the top free card, taking identity from the token and capping the lock", async () => {
    const { call, project, card, token, agent } = await setup();
    const first = await card("first"); await card("second");
    const { secret } = await token("Agent A", "codex");
    const res = await json(await call("/agent/v1/brain/proceed", post({ projectId: project.id }, agent(secret))));
    expect(res.card.id).toBe(first.id);
    expect(res.lock).toMatchObject({ cardId: first.id, agent: "Agent A", tool: "codex" });
    expect(res.rules).toBeTruthy();
    // A client cannot impersonate another agent or hold a lock beyond the server cap.
    const lock = await call("/agent/v1/brain/lock", post({ projectId: project.id, cardId: first.id, agent: "someone-else", tool: "claude", ttlSeconds: 3600 }, agent(secret)));
    expect(lock.status).toBe(409);
    const beat = await json(await call("/agent/v1/brain/heartbeat", post({ projectId: project.id, cardId: first.id, agent: "someone-else", tool: "claude" }, agent(secret))));
    expect(beat.lock).toMatchObject({ agent: "Agent A", tool: "codex" });
    expect(Date.parse(beat.lock.expiresAt) - Date.parse(beat.lock.since)).toBeLessThanOrEqual(1800 * 1000);
  });

  it("lets one agent hold one card, and others take the next free one", async () => {
    const { call, project, card, token, agent } = await setup();
    const first = await card("first"), second = await card("second");
    const a = await token("A", "codex"), b = await token("B", "copilot");
    expect((await json(await call("/agent/v1/brain/proceed", post({ projectId: project.id }, agent(a.secret))))).card.id).toBe(first.id);
    expect((await json(await call("/agent/v1/brain/proceed", post({ projectId: project.id }, agent(b.secret))))).card.id).toBe(second.id);
    expect((await call("/agent/v1/brain/lock", post({ projectId: project.id, cardId: second.id, agent: "A", tool: "codex", ttlSeconds: 60 }, agent(a.secret)))).status).toBe(409);
  });

  it("hands off and frees the card, and refuses server-only events and other projects", async () => {
    const { ctx, call, owner, project, card, token, agent } = await setup();
    const first = await card("first"); const { secret } = await token("A");
    await call("/agent/v1/brain/proceed", post({ projectId: project.id }, agent(secret)));
    expect((await call("/agent/v1/brain/handoff", post({ projectId: project.id, cardId: first.id, agent: "x", stoppedAt: "tests pass", next: "open PR" }, agent(secret)))).status).toBe(200);
    expect(ctx.db.rows("SELECT * FROM brain_locks")).toEqual([]);
    for (const kind of ["merged", "verified", "deploy", "validation"]) {
      expect((await call("/agent/v1/brain/log", post({ projectId: project.id, kind, actor: "x", text: "t" }, agent(secret)))).status).toBe(403);
    }
    expect((await call("/agent/v1/brain/log", post({ projectId: project.id, kind: "note", actor: "spoofed", text: "hello" }, agent(secret)))).status).toBe(201);
    expect(ctx.db.rows<{ actor: string }>("SELECT actor FROM brain_events WHERE kind='note' AND text='hello'")).toEqual([{ actor: "A" }]);
    const otherProject = (await json(await call("/v1/brain/projects", post({ owner: "acme", repo: "web" }, owner.headers)))).project;
    expect((await call("/agent/v1/brain/proceed", post({ projectId: otherProject.id }, agent(secret)))).status).toBe(403);
  });

  it("refuses agent tokens once their owner is suspended or deleting the account", async () => {
    const { ctx, call, owner, project, token, agent } = await setup();
    const t = await token("A");
    expect((await call("/agent/v1/brain/board", { headers: agent(t.secret) })).status).toBe(200);
    ctx.db.sqlite.exec(`UPDATE users SET status='suspended' WHERE id='${owner.userId}'`);
    expect((await call("/agent/v1/brain/board", { headers: agent(t.secret) })).status).toBe(401);
    ctx.db.sqlite.exec(`UPDATE users SET status='active' WHERE id='${owner.userId}'`);
    await ctx.db.prepare("INSERT INTO account_deletions(user_id,started_at) VALUES(?,?)").bind(owner.userId, ctx.time.now().toISOString()).run();
    expect((await call("/agent/v1/brain/proceed", post({ projectId: project.id }, agent(t.secret)))).status).toBe(401);
  });

  it("answers 404 without a session lookup while the flag is off", async () => {
    const ctx = testContext(), call = appFor(ctx);
    expect((await call("/v1/brain/projects")).status).toBe(404);
  });

  it("changes nothing when the lock expired before a handoff or PR link", async () => {
    const { ctx, call, project, card, token, agent } = await setup();
    const first = await card("first"); const { secret } = await token("A");
    await call("/agent/v1/brain/proceed", post({ projectId: project.id }, agent(secret)));
    ctx.time.advance(901 * 1000);
    expect((await call("/agent/v1/brain/handoff", post({ projectId: project.id, cardId: first.id, agent: "A", stoppedAt: "s", next: "n" }, agent(secret)))).status).toBe(409);
    expect((await call("/agent/v1/brain/pr", post({ projectId: project.id, cardId: first.id, prNumber: 7, head: "a".repeat(40) }, agent(secret)))).status).toBe(409);
    expect((await call("/agent/v1/brain/heartbeat", post({ projectId: project.id, cardId: first.id, agent: "A", tool: "codex" }, agent(secret)))).status).toBe(409);
    expect(ctx.db.rows("SELECT * FROM brain_handoffs")).toEqual([]);
    expect(ctx.db.rows<{ pr_number: number | null }>("SELECT pr_number FROM brain_cards WHERE id=?", first.id)).toEqual([{ pr_number: null }]);
  });

  it("refuses a revoked token", async () => {
    const { call, owner, project, token, agent } = await setup();
    const t = await token("A");
    expect((await call(`/v1/brain/projects/${project.id}/tokens/${t.token.id}`, { method: "DELETE", headers: owner.headers })).status).toBe(204);
    expect((await call("/agent/v1/brain/board", { headers: agent(t.secret) })).status).toBe(401);
  });

  it("stores and returns the project's rules", async () => {
    const { call, owner, project, card, token, agent } = await setup();
    await call(`/v1/brain/projects/${project.id}/rules`, { method: "PUT", headers: { ...owner.headers, "content-type": "application/json" }, body: JSON.stringify({ rules: "Gates green; squash with expectedHeadSha." }) });
    await card("first"); const { secret } = await token("A");
    expect((await json(await call("/agent/v1/brain/proceed", post({ projectId: project.id }, agent(secret))))).rules).toBe("Gates green; squash with expectedHeadSha.");
  });

  it("lets the owner proceed with the track on the same lock rules, from a seat no agent can use", async () => {
    const { ctx, call, owner, project, card, token, agent } = await setup();
    const first = await card("first"), second = await card("second");
    const proceed = (headers = owner.headers) => call(`/v1/brain/projects/${project.id}/proceed`, post({}, headers));
    const res = await json(await proceed());
    expect(res.card.id).toBe(first.id);
    expect(res.lock).toMatchObject({ cardId: first.id, agent: "owner", tool: "mergemate" });
    expect(Date.parse(res.lock.expiresAt) - Date.parse(res.lock.since)).toBe(900 * 1000);
    expect(res.rules).toBeTruthy();
    // Proceeding again resumes the owner's card; an agent gets the next free one.
    expect((await json(await proceed())).card.id).toBe(first.id);
    const { secret } = await token("Agent A");
    expect((await json(await call("/agent/v1/brain/proceed", post({ projectId: project.id }, agent(secret))))).card.id).toBe(second.id);
    // The seat is not an agent token: hidden from the list, outside the cap, and not revocable.
    const listed = await json(await call(`/v1/brain/projects/${project.id}/tokens`, { headers: owner.headers })) as unknown as { tokens: { id: string }[] };
    expect(listed.tokens.map((t) => t.id)).not.toContain(`owner:${project.id}`);
    expect((await call(`/v1/brain/projects/${project.id}/tokens/${encodeURIComponent(`owner:${project.id}`)}`, { method: "DELETE", headers: owner.headers })).status).toBe(404);
    expect(ctx.db.rows("SELECT * FROM brain_locks WHERE token_id=?", `owner:${project.id}`)).toHaveLength(1);
    // Another user cannot proceed on this board, and nothing is free once every card is locked.
    const other = await signIn(ctx, "ios", { ...ghUser, id: ghUser.id + 1, login: "other-user" });
    expect((await proceed(other.headers)).status).toBe(404);
    const { secret: third } = await token("Agent C", "muse");
    expect((await call("/agent/v1/brain/proceed", post({ projectId: project.id }, agent(third)))).status).toBe(404);
  });

  it("keeps the owner proceed route behind the brain flag", async () => {
    const { ctx, call, owner, project } = await setup();
    ctx.kv.set("flags:v1", JSON.stringify({ brain: false }));
    expect((await call(`/v1/brain/projects/${project.id}/proceed`, post({}, owner.headers))).status).toBe(404);
  });

  it("hides every brain path while the flag is off, signed in or not", async () => {
    const ctx = testContext(), call = appFor(ctx);
    for (const path of ["/v1/brain", "/v1/brain/projects", "/agent/v1/brain", "/agent/v1/brain/board"]) {
      expect((await call(path)).status).toBe(404);
    }
    on(ctx);
    expect((await call("/v1/brain/projects")).status).toBe(401);
  });

  it("releases the lock when the owner closes a card, and keeps it otherwise", async () => {
    const { ctx, call, owner, project, card, token, agent } = await setup();
    const first = await card("first"), second = await card("second"), third = await card("third");
    const a = await token("A"), b = await token("B", "copilot");
    await call("/agent/v1/brain/proceed", post({ projectId: project.id }, agent(a.secret)));
    await call("/agent/v1/brain/proceed", post({ projectId: project.id }, agent(b.secret)));
    const patch = (cardId: string, status: string) => call("/v1/brain/cards", { ...post({ projectId: project.id, cardId, status }, owner.headers), method: "PATCH" });
    expect((await patch(second.id, "review")).status).toBe(200);
    expect(ctx.db.rows("SELECT * FROM brain_locks WHERE card_id=?", second.id)).toHaveLength(1);
    expect((await patch(first.id, "merged")).status).toBe(200);
    expect(ctx.db.rows("SELECT * FROM brain_locks WHERE card_id=?", first.id)).toEqual([]);
    expect(ctx.db.rows<{ actor: string }>("SELECT actor FROM brain_events WHERE card_id=? AND kind='unlock'", first.id)).toEqual([{ actor: "owner" }]);
    // The freed agent can take the next free card straight away.
    expect((await json(await call("/agent/v1/brain/proceed", post({ projectId: project.id }, agent(a.secret))))).card.id).toBe(third.id);
  });

  it("caps the events agents can log on one board in a day", async () => {
    const { ctx, call, project, token, agent } = await setup();
    const { secret } = await token("A");
    const at = ctx.time.now().toISOString();
    const insert = ctx.db.prepare("INSERT INTO brain_events(id,project_id,card_id,kind,actor,text,at) VALUES(?,?,NULL,'note','A','x',?)");
    for (let i = 0; i < 999; i++) await insert.bind(`seed-${i}`, project.id, at).run();
    const log = () => call("/agent/v1/brain/log", post({ projectId: project.id, kind: "note", actor: "A", text: "hello" }, agent(secret)));
    expect((await log()).status).toBe(201);
    expect((await log()).status).toBe(429);
  });
});
