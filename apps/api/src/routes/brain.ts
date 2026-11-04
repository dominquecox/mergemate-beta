import {
  CardHandoffRequestSchema, CardHeartbeatRequestSchema, CardLockRequestSchema, CreateCardRequestSchema, LinkPrRequestSchema,
  ProceedWithTrackRequestSchema, ReorderCardRequestSchema, ToolSchema, TrackLogRequestSchema, UpdateCardRequestSchema,
  type ProceedWithTrackResponse,
} from "@mergemate/contracts";
import { Hono, type Context } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { ApiError } from "../errors";
import { parseBody } from "../lib/validate";
import { authenticateAgent, newAgentSecret } from "../brain/agent-auth";
import { requireBrain } from "../brain/flag";
import {
  BOARD_TOP, DEFAULT_RULES, LOCK_TTL_MAX_SECONDS, LOCK_TTL_SECONDS, acquireLock, boardCards, cardIn, db, eventStatement, liveLockFor,
  liveLocks, lockOnCard, ownedProject, projectById, toCard, toLock, toProject, toToken, trackTail, type TokenRow,
} from "../brain/store";

/** Human-only request bodies. Agent requests use the shared brain contracts. */
const RepoPart = z.string().regex(/^[A-Za-z0-9_.-]{1,100}$/);
const CreateProjectBody = z.object({ owner: RepoPart, repo: RepoPart, rules: z.string().trim().min(1).max(20480).optional() }).strict();
const RulesBody = z.object({ rules: z.string().trim().min(1).max(20480) }).strict();
const CreateTokenBody = z.object({ name: z.string().trim().min(1).max(128), tool: ToolSchema }).strict();
/** Kinds an agent may log itself. lock/unlock/handoff come from their own calls; merged, verified, validation and deploy only from the server. */
const CLIENT_EVENT_KINDS = new Set(["note", "pr_opened"]);
/** Per-owner limits, so one account cannot grow a board without bound. */
export const MAX_PROJECTS_PER_USER = 50;
export const MAX_CARDS_PER_PROJECT = 500;
export const MAX_TOKENS_PER_PROJECT = 20;
/** Holds only while this token still has a live lock on the card; every lock-gated write carries it. */
const HOLDS_LOCK = "EXISTS(SELECT 1 FROM brain_locks WHERE card_id=? AND token_id=? AND expires_at>?)";
const lostLock = () => new ApiError("state_conflict", "Your lock on this card expired. Proceed or lock it again.");

const nowOf = (c: Context<AppEnv>) => c.get("deps").now();
const realUser = (c: Context<AppEnv>) => {
  const session = c.get("session");
  if (!session.userId || session.demo) throw new ApiError("forbidden", "Sign in with GitHub to use boards.");
  return session.userId;
};
const agentName = (token: TokenRow) => token.name.slice(0, 60);

/** Signed-in owners: projects, rules, cards and agent tokens. Every route checks that the project is theirs. */
export function createBrainRouter() {
  const r = new Hono<AppEnv>();
  r.use("*", async (c, next) => { await requireBrain(c.env); c.header("Cache-Control", "no-store"); return next(); });

  r.get("/projects", async (c) => {
    const rows = await db(c.env).prepare("SELECT * FROM brain_projects WHERE user_id=? ORDER BY created_at").bind(realUser(c)).all<Parameters<typeof toProject>[0]>();
    return c.json({ projects: (rows.results ?? []).map(toProject) });
  });
  r.post("/projects", async (c) => {
    const user = realUser(c), body = await parseBody(c, CreateProjectBody), now = nowOf(c).toISOString(), id = crypto.randomUUID();
    const result = await db(c.env).prepare("INSERT INTO brain_projects(id,user_id,owner,repo,rules,created_at) SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM brain_projects WHERE user_id=?)<? ON CONFLICT(user_id,owner,repo) DO NOTHING")
      .bind(id, user, body.owner, body.repo, body.rules ?? DEFAULT_RULES, now, user, MAX_PROJECTS_PER_USER).run();
    if (result.meta.changes !== 1) throw new ApiError("state_conflict", `You already have a board for this repository, or ${MAX_PROJECTS_PER_USER} boards.`);
    return c.json({ project: toProject(await ownedProject(c.env, user, id)) }, 201);
  });
  r.get("/projects/:id", async (c) => {
    const project = await ownedProject(c.env, realUser(c), c.req.param("id")), now = nowOf(c);
    return c.json({ project: toProject(project), cards: await boardCards(c.env, project.id), locks: await liveLocks(c.env, project.id, now), trackTail: await trackTail(c.env, project.id) });
  });
  r.put("/projects/:id/rules", async (c) => {
    const user = realUser(c), project = await ownedProject(c.env, user, c.req.param("id")), body = await parseBody(c, RulesBody);
    await db(c.env).prepare("UPDATE brain_projects SET rules=? WHERE id=? AND user_id=?").bind(body.rules, project.id, user).run();
    return c.json({ project: toProject({ ...project, rules: body.rules }) });
  });

  r.post("/cards", async (c) => {
    const user = realUser(c), body = await parseBody(c, CreateCardRequestSchema), project = await ownedProject(c.env, user, body.projectId), now = nowOf(c).toISOString(), id = crypto.randomUUID();
    const added = await db(c.env).batch([
      db(c.env).prepare("INSERT INTO brain_cards(id,project_id,position,title,details,priority,status,done_when,updated_at) SELECT ?,?,COALESCE(MAX(position)+1,0),?,?,?,'open',?,? FROM brain_cards WHERE project_id=? HAVING COUNT(*)<?")
        .bind(id, project.id, body.title, body.details, body.priority, body.doneWhen, now, project.id, MAX_CARDS_PER_PROJECT),
      db(c.env).prepare("INSERT INTO brain_events(id,project_id,card_id,kind,actor,text,at) SELECT ?,?,?,'note','owner',?,? WHERE EXISTS(SELECT 1 FROM brain_cards WHERE id=?)")
        .bind(crypto.randomUUID(), project.id, id, `Card added: ${body.title}`.slice(0, 4096), now, id),
    ]);
    if (added[0]?.meta.changes !== 1) throw new ApiError("state_conflict", `A board holds at most ${MAX_CARDS_PER_PROJECT} cards.`);
    return c.json({ card: toCard(await cardIn(c.env, project.id, id)) }, 201);
  });
  r.patch("/cards", async (c) => {
    const user = realUser(c), body = await parseBody(c, UpdateCardRequestSchema), project = await ownedProject(c.env, user, body.projectId), card = await cardIn(c.env, project.id, body.cardId);
    const next = { ...card, ...(body.title ? { title: body.title } : {}), ...(body.details ? { details: body.details } : {}), ...(body.priority ? { priority: body.priority } : {}), ...(body.doneWhen ? { done_when: body.doneWhen } : {}), ...(body.status ? { status: body.status } : {}), updated_at: nowOf(c).toISOString() };
    await db(c.env).prepare("UPDATE brain_cards SET title=?,details=?,priority=?,done_when=?,status=?,updated_at=? WHERE id=? AND project_id=?")
      .bind(next.title, next.details, next.priority, next.done_when, next.status, next.updated_at, card.id, project.id).run();
    return c.json({ card: toCard(next) });
  });
  r.post("/cards/reorder", async (c) => {
    const user = realUser(c), body = await parseBody(c, ReorderCardRequestSchema), project = await ownedProject(c.env, user, body.projectId);
    await cardIn(c.env, project.id, body.cardId);
    const order = (await boardCards(c.env, project.id, MAX_CARDS_PER_PROJECT)).map((card) => card.id).filter((id) => id !== body.cardId);
    order.splice(Math.min(body.newPosition, order.length), 0, body.cardId);
    const now = nowOf(c).toISOString();
    await db(c.env).batch(order.map((id, position) => db(c.env).prepare("UPDATE brain_cards SET position=?,updated_at=? WHERE id=? AND project_id=?").bind(position, now, id, project.id)));
    return c.json({ cards: await boardCards(c.env, project.id) });
  });

  r.get("/projects/:id/tokens", async (c) => {
    const project = await ownedProject(c.env, realUser(c), c.req.param("id"));
    const rows = await db(c.env).prepare("SELECT id,project_id,name,tool,created_at,last_used_at,revoked_at FROM brain_agent_tokens WHERE project_id=? AND revoked_at IS NULL ORDER BY created_at").bind(project.id).all<TokenRow>();
    return c.json({ tokens: (rows.results ?? []).map(toToken) });
  });
  r.post("/projects/:id/tokens", async (c) => {
    const project = await ownedProject(c.env, realUser(c), c.req.param("id")), body = await parseBody(c, CreateTokenBody), now = nowOf(c).toISOString(), id = crypto.randomUUID();
    const { secret, hash } = await newAgentSecret();
    const created = await db(c.env).prepare("INSERT INTO brain_agent_tokens(id,project_id,name,tool,token_hash,created_at) SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM brain_agent_tokens WHERE project_id=? AND revoked_at IS NULL)<?")
      .bind(id, project.id, body.name, body.tool, hash, now, project.id, MAX_TOKENS_PER_PROJECT).run();
    if (created.meta.changes !== 1) throw new ApiError("state_conflict", `A board holds at most ${MAX_TOKENS_PER_PROJECT} active agent tokens. Revoke one first.`);
    // The secret is returned this once and never stored or shown again.
    return c.json({ token: toToken({ id, project_id: project.id, name: body.name, tool: body.tool, created_at: now, last_used_at: null, revoked_at: null }), secret }, 201);
  });
  r.delete("/projects/:id/tokens/:tokenId", async (c) => {
    const project = await ownedProject(c.env, realUser(c), c.req.param("id")), now = nowOf(c).toISOString();
    const result = await db(c.env).batch([
      db(c.env).prepare("UPDATE brain_agent_tokens SET revoked_at=? WHERE id=? AND project_id=? AND revoked_at IS NULL").bind(now, c.req.param("tokenId"), project.id),
      db(c.env).prepare("DELETE FROM brain_locks WHERE token_id=? AND project_id=?").bind(c.req.param("tokenId"), project.id),
    ]);
    if (result[0]?.meta.changes !== 1) throw new ApiError("not_found", "That token does not exist.");
    return c.body(null, 204);
  });
  return r;
}

/** Agents: authenticated by their project token. Agent, tool and actor always come from the token, not the body. */
export function createBrainAgentRouter() {
  const r = new Hono<AppEnv>();
  r.use("*", async (c, next) => { await requireBrain(c.env); c.header("Cache-Control", "no-store"); return next(); });
  const scoped = async (c: Context<AppEnv>, projectId: string) => {
    const token = await authenticateAgent(c);
    if (token.project_id !== projectId) throw new ApiError("forbidden", "This token is for another project.");
    return { token, project: await projectById(c.env, projectId) };
  };
  const heldLock = async (c: Context<AppEnv>, token: TokenRow, cardId: string) => {
    const lock = await lockOnCard(c.env, cardId, nowOf(c));
    if (!lock || lock.token_id !== token.id) throw new ApiError("state_conflict", "Lock this card before changing it.");
    return lock;
  };

  r.get("/board", async (c) => {
    const token = await authenticateAgent(c), project = await projectById(c.env, token.project_id);
    return c.json({ project: toProject(project), cards: await boardCards(c.env, project.id), trackTail: await trackTail(c.env, project.id) });
  });

  r.post("/proceed", async (c) => {
    const body = await parseBody(c, ProceedWithTrackRequestSchema), { token, project } = await scoped(c, body.projectId), now = nowOf(c);
    // Resume the card this agent already holds; otherwise take the top card without a live lock.
    const held = await liveLockFor(c.env, token.id, now);
    let lock = held ? toLock(held) : null, cardId = held?.card_id ?? null;
    if (!lock) {
      const candidates = await db(c.env).prepare("SELECT c.id FROM brain_cards c WHERE c.project_id=? AND c.status IN ('open','active') AND NOT EXISTS(SELECT 1 FROM brain_locks l WHERE l.card_id=c.id AND l.expires_at>?) ORDER BY c.position LIMIT 5")
        .bind(project.id, now.toISOString()).all<{ id: string }>();
      for (const candidate of candidates.results ?? []) {
        lock = await acquireLock(c.env, { projectId: project.id, cardId: candidate.id, tokenId: token.id, agent: agentName(token), tool: token.tool, now, ttlSeconds: LOCK_TTL_SECONDS });
        if (lock) { cardId = candidate.id; break; }
      }
    }
    if (!lock || !cardId) throw new ApiError("not_found", "No open card is free right now.");
    const response: ProceedWithTrackResponse = {
      card: toCard(await cardIn(c.env, project.id, cardId)), lock, rules: project.rules,
      boardTop: (await boardCards(c.env, project.id, BOARD_TOP)), trackTail: await trackTail(c.env, project.id),
    };
    return c.json(response);
  });

  r.post("/lock", async (c) => {
    const body = await parseBody(c, CardLockRequestSchema), { token, project } = await scoped(c, body.projectId), now = nowOf(c);
    await cardIn(c.env, project.id, body.cardId);
    const lock = await acquireLock(c.env, { projectId: project.id, cardId: body.cardId, tokenId: token.id, agent: agentName(token), tool: token.tool, now, ttlSeconds: Math.min(body.ttlSeconds, LOCK_TTL_MAX_SECONDS) });
    if (!lock) throw new ApiError("state_conflict", "That card is locked, closed, or you already hold another card. Hand off first.");
    return c.json({ lock });
  });

  r.post("/heartbeat", async (c) => {
    const body = await parseBody(c, CardHeartbeatRequestSchema), { token, project } = await scoped(c, body.projectId), now = nowOf(c);
    await heldLock(c, token, body.cardId);
    // The server sets the new expiry; the request cannot extend a lock beyond the standard TTL.
    const expires = new Date(now.getTime() + LOCK_TTL_SECONDS * 1000).toISOString();
    const renewed = await db(c.env).prepare("UPDATE brain_locks SET expires_at=? WHERE card_id=? AND token_id=? AND project_id=? AND expires_at>?").bind(expires, body.cardId, token.id, project.id, now.toISOString()).run();
    if (renewed.meta.changes !== 1) throw lostLock();
    const lock = await lockOnCard(c.env, body.cardId, now);
    return c.json({ lock: lock ? toLock(lock) : null });
  });

  r.post("/handoff", async (c) => {
    const body = await parseBody(c, CardHandoffRequestSchema), { token, project } = await scoped(c, body.projectId), now = nowOf(c).toISOString();
    await heldLock(c, token, body.cardId);
    const agent = agentName(token), d = db(c.env), hold = [body.cardId, token.id, now];
    // Each write re-checks the live lock, and the lock is released last, so a lock lost mid-request changes nothing.
    const done = await d.batch([
      d.prepare(`INSERT INTO brain_handoffs(id,card_id,agent,stopped_at,branch,head,next,at) SELECT ?,?,?,?,?,?,?,? WHERE ${HOLDS_LOCK}`).bind(crypto.randomUUID(), body.cardId, agent, body.stoppedAt, body.branch ?? null, body.head ?? null, body.next, now, ...hold),
      d.prepare(`UPDATE brain_cards SET status=CASE WHEN status='active' THEN 'open' ELSE status END,branch=COALESCE(?,branch),head=COALESCE(?,head),updated_at=? WHERE id=? AND project_id=? AND ${HOLDS_LOCK}`).bind(body.branch ?? null, body.head ?? null, now, body.cardId, project.id, ...hold),
      d.prepare(`INSERT INTO brain_events(id,project_id,card_id,kind,actor,text,at) SELECT ?,?,?,'handoff',?,?,? WHERE ${HOLDS_LOCK}`).bind(crypto.randomUUID(), project.id, body.cardId, agent, `Stopped: ${body.stoppedAt}\nNext: ${body.next}`.slice(0, 4096), now, ...hold),
      d.prepare("DELETE FROM brain_locks WHERE card_id=? AND token_id=? AND expires_at>?").bind(...hold),
    ]);
    if (done[0]?.meta.changes !== 1) throw lostLock();
    return c.json({ handedOff: true });
  });

  r.post("/log", async (c) => {
    const body = await parseBody(c, TrackLogRequestSchema), { token, project } = await scoped(c, body.projectId);
    if (!CLIENT_EVENT_KINDS.has(body.kind)) throw new ApiError("forbidden", "Only the server records that kind of event.");
    if (body.cardId) await cardIn(c.env, project.id, body.cardId);
    await eventStatement(c.env, { projectId: project.id, cardId: body.cardId, kind: body.kind, actor: agentName(token), text: body.text, at: nowOf(c).toISOString() }).run();
    return c.json({ logged: true }, 201);
  });

  r.post("/pr", async (c) => {
    const body = await parseBody(c, LinkPrRequestSchema), { token, project } = await scoped(c, body.projectId), now = nowOf(c).toISOString();
    await heldLock(c, token, body.cardId);
    const hold = [body.cardId, token.id, now];
    const linked = await db(c.env).batch([
      db(c.env).prepare(`UPDATE brain_cards SET pr_number=?,head=?,status='review',updated_at=? WHERE id=? AND project_id=? AND ${HOLDS_LOCK}`).bind(body.prNumber, body.head, now, body.cardId, project.id, ...hold),
      db(c.env).prepare(`INSERT INTO brain_events(id,project_id,card_id,kind,actor,text,at) SELECT ?,?,?,'pr_opened',?,?,? WHERE ${HOLDS_LOCK}`).bind(crypto.randomUUID(), project.id, body.cardId, agentName(token), `PR #${body.prNumber} at ${body.head}`, now, ...hold),
    ]);
    if (linked[0]?.meta.changes !== 1) throw lostLock();
    return c.json({ card: toCard(await cardIn(c.env, project.id, body.cardId)) });
  });
  return r;
}
