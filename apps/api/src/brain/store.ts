import type { AgentToken, Card, CardStatus, Lock, Priority, Project, Tool, TrackEvent, TrackEventKind } from "@mergemate/contracts";
import type { Env } from "../env";
import { ApiError } from "../errors";
import { requireBinding } from "../config";

/** Locks last this long unless renewed by a heartbeat; a client may ask for less, never more. */
export const LOCK_TTL_SECONDS = 900;
export const LOCK_TTL_MAX_SECONDS = 1800;
export const BOARD_TOP = 20;
export const TRACK_TAIL = 50;
export const DEFAULT_RULES = "Work one card at a time. Lock it before you start, hand off when you stop, and open a PR for review.";

export interface ProjectRow { id: string; user_id: string; owner: string; repo: string; rules: string; created_at: string }
interface CardRow { id: string; project_id: string; position: number; title: string; details: string; priority: Priority; status: CardStatus; done_when: string; branch: string | null; pr_number: number | null; head: string | null; updated_at: string }
interface LockRow { card_id: string; project_id: string; token_id: string; agent: string; tool: Tool; since: string; expires_at: string }
interface EventRow { id: string; project_id: string; card_id: string | null; kind: TrackEventKind; actor: string; text: string; at: string }
export interface TokenRow { id: string; project_id: string; name: string; tool: Tool; created_at: string; last_used_at: string | null; revoked_at: string | null }

export const db = (env: Env) => requireBinding(env, "DB");

export const toProject = (row: ProjectRow): Project => ({ id: row.id, owner: row.owner, repo: row.repo, rules: row.rules, createdAt: row.created_at });
export const toCard = (row: CardRow): Card => ({
  id: row.id, projectId: row.project_id, position: row.position, title: row.title, details: row.details, priority: row.priority,
  status: row.status, doneWhen: row.done_when, updatedAt: row.updated_at,
  ...(row.branch ? { branch: row.branch } : {}), ...(row.pr_number ? { prNumber: row.pr_number } : {}), ...(row.head ? { head: row.head } : {}),
});
export const toLock = (row: LockRow): Lock => ({ cardId: row.card_id, agent: row.agent, tool: row.tool, since: row.since, expiresAt: row.expires_at });
const toEvent = (row: EventRow): TrackEvent => ({
  id: row.id, projectId: row.project_id, kind: row.kind, actor: row.actor, text: row.text, at: row.at, ...(row.card_id ? { cardId: row.card_id } : {}),
});
export const toToken = (row: TokenRow): AgentToken => ({
  id: row.id, projectId: row.project_id, name: row.name, tool: row.tool, createdAt: row.created_at, ...(row.last_used_at ? { lastUsedAt: row.last_used_at } : {}),
});

const notFound = () => new ApiError("not_found", "That project or card does not exist.");

/** The project, only when it belongs to this user. Another user's project reads as not found. */
export async function ownedProject(env: Env, userId: string, projectId: string): Promise<ProjectRow> {
  const row = await db(env).prepare("SELECT * FROM brain_projects WHERE id=? AND user_id=?").bind(projectId, userId).first<ProjectRow>();
  if (!row) throw notFound();
  return row;
}

export async function projectById(env: Env, projectId: string): Promise<ProjectRow> {
  const row = await db(env).prepare("SELECT * FROM brain_projects WHERE id=?").bind(projectId).first<ProjectRow>();
  if (!row) throw notFound();
  return row;
}

export async function cardIn(env: Env, projectId: string, cardId: string): Promise<CardRow> {
  const row = await db(env).prepare("SELECT * FROM brain_cards WHERE id=? AND project_id=?").bind(cardId, projectId).first<CardRow>();
  if (!row) throw notFound();
  return row;
}

export async function boardCards(env: Env, projectId: string, limit = 200): Promise<Card[]> {
  const rows = await db(env).prepare("SELECT * FROM brain_cards WHERE project_id=? ORDER BY position, updated_at LIMIT ?").bind(projectId, limit).all<CardRow>();
  return (rows.results ?? []).map(toCard);
}

export async function trackTail(env: Env, projectId: string): Promise<TrackEvent[]> {
  const rows = await db(env).prepare("SELECT * FROM brain_events WHERE project_id=? ORDER BY at DESC, id DESC LIMIT ?").bind(projectId, TRACK_TAIL).all<EventRow>();
  return (rows.results ?? []).map(toEvent);
}

export async function liveLocks(env: Env, projectId: string, now: Date): Promise<Lock[]> {
  const rows = await db(env).prepare("SELECT * FROM brain_locks WHERE project_id=? AND expires_at>?").bind(projectId, now.toISOString()).all<LockRow>();
  return (rows.results ?? []).map(toLock);
}

export const eventStatement = (env: Env, e: { projectId: string; cardId?: string | undefined; kind: TrackEventKind; actor: string; text: string; at: string }) =>
  db(env).prepare("INSERT INTO brain_events(id,project_id,card_id,kind,actor,text,at) VALUES(?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), e.projectId, e.cardId ?? null, e.kind, e.actor.slice(0, 128), e.text.slice(0, 4096), e.at);

export async function liveLockFor(env: Env, tokenId: string, now: Date): Promise<LockRow | null> {
  return db(env).prepare("SELECT * FROM brain_locks WHERE token_id=? AND expires_at>?").bind(tokenId, now.toISOString()).first<LockRow>();
}

export async function lockOnCard(env: Env, cardId: string, now: Date): Promise<LockRow | null> {
  return db(env).prepare("SELECT * FROM brain_locks WHERE card_id=? AND expires_at>?").bind(cardId, now.toISOString()).first<LockRow>();
}

/**
 * Takes the card for the token in one batch: clears an expired lock, inserts only when no live lock exists and the
 * token holds no other live lock, then marks the card active and logs it. Returns the lock, or null if it was taken.
 */
export async function acquireLock(env: Env, a: { projectId: string; cardId: string; tokenId: string; agent: string; tool: Tool; now: Date; ttlSeconds: number }): Promise<Lock | null> {
  const since = a.now.toISOString(), expires = new Date(a.now.getTime() + a.ttlSeconds * 1000).toISOString(), d = db(env);
  const results = await d.batch([
    d.prepare("DELETE FROM brain_locks WHERE (card_id=? OR token_id=?) AND expires_at<=?").bind(a.cardId, a.tokenId, since),
    d.prepare("INSERT INTO brain_locks(card_id,project_id,token_id,agent,tool,since,expires_at) SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM brain_locks WHERE card_id=? OR token_id=?) AND EXISTS(SELECT 1 FROM brain_cards WHERE id=? AND project_id=? AND status IN ('open','active'))")
      .bind(a.cardId, a.projectId, a.tokenId, a.agent, a.tool, since, expires, a.cardId, a.tokenId, a.cardId, a.projectId),
    d.prepare("UPDATE brain_cards SET status='active',updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM brain_locks WHERE card_id=? AND token_id=? AND since=?)").bind(since, a.cardId, a.cardId, a.tokenId, since),
    d.prepare("INSERT INTO brain_events(id,project_id,card_id,kind,actor,text,at) SELECT ?,?,?,'lock',?,?,? WHERE EXISTS(SELECT 1 FROM brain_locks WHERE card_id=? AND token_id=? AND since=?)")
      .bind(crypto.randomUUID(), a.projectId, a.cardId, a.agent, `Locked by ${a.agent} (${a.tool}).`, since, a.cardId, a.tokenId, since),
  ]);
  if (results[1]?.meta.changes !== 1) return null;
  return { cardId: a.cardId, agent: a.agent, tool: a.tool, since, expiresAt: expires };
}
