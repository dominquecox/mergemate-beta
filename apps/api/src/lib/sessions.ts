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
  userId: string | null;
  demo: boolean;
  transport: Transport;
  csrfToken: string | null;
  expiresAt: string;
  userStatus: string | null;
}

interface SessionRow {
  token_hash: string;
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
      `INSERT INTO sessions (token_hash, user_id, demo, transport, csrf_token, created_at, last_seen_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(await sha256Hex(token), input.userId, demo ? 1 : 0, input.transport, csrfToken, now, now, expiresAt)
    .run();
  return { token, expiresAt, csrfToken };
};

/** Looks up a live session by its raw token. Expired and idle sessions are deleted and return null. */
export const resolveSession = async (db: D1Database, token: string, now: Date): Promise<SessionRecord | null> => {
  const tokenHash = await sha256Hex(token);
  const row = await db
    .prepare(
      `SELECT s.token_hash, s.user_id, s.demo, s.transport, s.csrf_token, s.last_seen_at, s.expires_at, u.status
       FROM sessions s LEFT JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`,
    )
    .bind(tokenHash)
    .first<SessionRow>();
  if (!row) return null;

  const nowMs = now.getTime();
  const lastSeen = Date.parse(row.last_seen_at);
  if (Date.parse(row.expires_at) <= nowMs || lastSeen + IDLE_TTL_MS <= nowMs) {
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

/** Issues a new token for the same session lifetime and deletes the old one. */
export const rotateSession = async (db: D1Database, session: SessionRecord, now: Date) => {
  const issued = await createSession(db, {
    userId: session.userId,
    transport: session.transport,
    now,
    expiresAt: session.expiresAt,
  });
  await db.batch([
    db.prepare('UPDATE push_tokens SET session_hash=? WHERE session_hash=? AND user_id=?')
      .bind(await sha256Hex(issued.token), session.tokenHash, session.userId),
    db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(session.tokenHash),
  ]);
  return issued;
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
