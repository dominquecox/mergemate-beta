import {ApiError} from "../errors";
import { randomToken, sha256Hex } from "./crypto";

const DAY_MS = 24 * 60 * 60 * 1000;
export const SESSION_TTL_MS = 30 * DAY_MS;
export const DEMO_SESSION_TTL_MS = DAY_MS;
export const IDLE_TTL_MS = 7 * DAY_MS;
// Avoid a write on every request: last_seen_at is refreshed at most this often.
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;

export type Transport = "bearer" | "cookie";

export interface SessionRecord {
  tokenHash: string;
  familyId?: string;
  userId: string | null;
  demo: boolean;
  transport: Transport;
  csrfToken: string | null;
  expiresAt: string;
  userStatus: string | null;
}

interface SessionRow {
  token_hash: string;
  family_id: string;
  user_id: string | null;
  demo: number;
  transport: Transport;
  csrf_token: string | null;
  last_seen_at: string;
  expires_at: string;
  status: string | null;
}

export interface IssuedSession {
  token: string;
  expiresAt: string;
  csrfToken: string | null;
}

export const createSession = async (
  db: D1Database,
  input: { userId: string | null; transport: Transport; now: Date; expiresAt?: string },
): Promise<IssuedSession> => {
  const token = randomToken();
  const demo = input.userId === null;
  const now = input.now.toISOString();
  const expiresAt =
    input.expiresAt ??
    new Date(input.now.getTime() + (demo ? DEMO_SESSION_TTL_MS : SESSION_TTL_MS)).toISOString();
  const csrfToken = input.transport === "cookie" ? randomToken() : null;
  await db
    .prepare(
      `INSERT INTO sessions (token_hash, user_id, demo, transport, csrf_token, created_at, last_seen_at, expires_at, family_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(await sha256Hex(token), input.userId, demo ? 1 : 0, input.transport, csrfToken, now, now, expiresAt, crypto.randomUUID())
    .run();
  return { token, expiresAt, csrfToken };
};

/** Looks up a live session by its raw token. Expired and idle sessions are deleted and return null. */
export const resolveSession = async (db: D1Database, token: string, now: Date): Promise<SessionRecord | null> => {
  const tokenHash = await sha256Hex(token);
  const row = await db
    .prepare(
      `SELECT s.token_hash, s.family_id, s.user_id, s.demo, s.transport, s.csrf_token, s.last_seen_at, s.expires_at, u.status
       FROM sessions s LEFT JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`,
    )
    .bind(tokenHash)
    .first<SessionRow>();
  if (!row) return null;

  const nowMs = now.getTime();
  const lastSeen = Date.parse(row.last_seen_at);
  if (!Number.isFinite(Date.parse(row.expires_at)) || !Number.isFinite(lastSeen) || Date.parse(row.expires_at) <= nowMs || lastSeen + IDLE_TTL_MS <= nowMs) {
    await deleteSession(db, tokenHash);
    return null;
  }
  if (nowMs - lastSeen >= TOUCH_INTERVAL_MS) {
    await db
      .prepare("UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?")
      .bind(now.toISOString(), tokenHash)
      .run();
  }
  return {
    tokenHash,
    familyId: row.family_id || tokenHash,
    userId: row.user_id,
    demo: row.demo === 1,
    transport: row.transport,
    csrfToken: row.csrf_token,
    expiresAt: row.expires_at,
    userStatus: row.status,
  };
};

export const deleteSession = (db: D1Database, tokenHash: string) =>
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();

/** A rotated token is a logout-only credential; it never becomes a live session again. */
export const resolveSpentSessionForLogout=async(db:D1Database,token:string,now:Date):Promise<SessionRecord|null>=>{
  const tokenHash=await sha256Hex(token);
  const row=await db.prepare(`SELECT l.*,u.status FROM session_lineage l LEFT JOIN users u ON u.id=l.user_id WHERE l.token_hash=?`).bind(tokenHash).first<SessionRow>();
  if(!row || !Number.isFinite(Date.parse(row.expires_at)) || !Number.isFinite(Date.parse(row.last_seen_at)) || Date.parse(row.expires_at)<=now.getTime() || Date.parse(row.last_seen_at)+IDLE_TTL_MS<=now.getTime())return null;
  return {tokenHash,familyId:row.family_id,userId:row.user_id,demo:row.demo===1,transport:row.transport,csrfToken:row.csrf_token,expiresAt:row.expires_at,userStatus:row.status};
};

export const revokeSessionFamily=(db:D1Database,session:SessionRecord)=>{
  const family=session.familyId??session.tokenHash;
  return db.batch([
    db.prepare('DELETE FROM session_lineage WHERE family_id=?').bind(family),
    db.prepare("DELETE FROM sessions WHERE COALESCE(NULLIF(family_id,''),token_hash)=?").bind(family),
  ]);
};

/** One atomic rotation wins; no orphan replacement or limiter-identity reset is possible. */
export const rotateSession=async(db:D1Database,session:SessionRecord,now:Date):Promise<IssuedSession>=>{
  const token=randomToken(),tokenHash=await sha256Hex(token);
  const csrfToken=session.transport==='cookie'?randomToken():null;
  const stamp=now.toISOString(),idle=new Date(now.getTime()-IDLE_TTL_MS).toISOString();
  const results=await db.batch([
    db.prepare(`INSERT INTO sessions(token_hash,user_id,demo,transport,csrf_token,created_at,last_seen_at,expires_at,family_id)
      SELECT ?,user_id,demo,transport,?,?,?,expires_at,COALESCE(NULLIF(family_id,''),token_hash) FROM sessions s
      WHERE token_hash=? AND transport=? AND expires_at>? AND last_seen_at>?
        AND (demo=1 OR EXISTS(SELECT 1 FROM users u WHERE u.id=s.user_id AND u.status='active'))
    `).bind(tokenHash,csrfToken,stamp,stamp,session.tokenHash,session.transport,stamp,idle),
    db.prepare(`INSERT INTO session_lineage(token_hash,family_id,user_id,demo,transport,csrf_token,last_seen_at,expires_at)
      SELECT token_hash,COALESCE(NULLIF(family_id,''),token_hash),user_id,demo,transport,csrf_token,last_seen_at,expires_at
      FROM sessions WHERE token_hash=? AND EXISTS(SELECT 1 FROM sessions WHERE token_hash=?)`).bind(session.tokenHash,tokenHash),
    db.prepare('UPDATE push_tokens SET session_hash=? WHERE session_hash=? AND EXISTS(SELECT 1 FROM sessions WHERE token_hash=?)').bind(tokenHash,session.tokenHash,tokenHash),
    db.prepare('UPDATE web_push_subscriptions SET session_hash=? WHERE session_hash=? AND EXISTS(SELECT 1 FROM sessions WHERE token_hash=?)').bind(tokenHash,session.tokenHash,tokenHash),
    db.prepare('DELETE FROM sessions WHERE token_hash=? AND EXISTS(SELECT 1 FROM sessions WHERE token_hash=?)').bind(session.tokenHash,tokenHash),
    db.prepare('DELETE FROM session_lineage WHERE expires_at<=? OR last_seen_at<=?').bind(stamp,idle),
  ]);
  if(results[0]?.meta.changes!==1)throw new ApiError('unauthorized','Sign in to continue.');
  return {token,csrfToken,expiresAt:session.expiresAt};
};

const COOKIE = "__Host-mm_session";

export const sessionCookie = (token: string, expiresAt: string, now: Date) => {
  const maxAge = Math.max(0, Math.floor((Date.parse(expiresAt) - now.getTime()) / 1000));
  return `${COOKIE}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
};

export const clearedSessionCookie = () => `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

export const readSessionCookie = (header: string | undefined) => {
  for (const part of header?.split(";") ?? []) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE) return rest.join("=") || null;
  }
  return null;
};

/** Bounded-retention cleanup also runs on the existing15-minute cron, without provider calls. */
export const purgeExpiredSessions=(db:D1Database,now:Date)=>db.batch([
  db.prepare('DELETE FROM session_lineage WHERE expires_at<=? OR last_seen_at<=?').bind(now.toISOString(),new Date(now.getTime()-IDLE_TTL_MS).toISOString()),
  db.prepare('DELETE FROM sessions WHERE expires_at<=? OR last_seen_at<=?').bind(now.toISOString(),new Date(now.getTime()-IDLE_TTL_MS).toISOString()),
]);
