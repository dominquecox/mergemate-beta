import type { Context } from "hono";
import type { AppEnv } from "../env";
import { ApiError } from "../errors";
import { randomToken, sha256Hex } from "../lib/crypto";
import { limit } from "../middleware/rate-limit";
import { db, type TokenRow } from "./store";

const PREFIX = "mmb_";
const TOKEN_PATTERN = /^Bearer (mmb_[A-Za-z0-9_-]{43})$/;

/** A new agent secret and the hash that is stored. The secret itself is returned once and never stored. */
export async function newAgentSecret(): Promise<{ secret: string; hash: string }> {
  const secret = PREFIX + randomToken();
  return { secret, hash: await sha256Hex(secret) };
}

/**
 * Resolves the calling agent from its bearer token. Identity (project, name, tool) always comes from the token row,
 * never from the request body. Revoked or unknown tokens are refused the same way.
 */
export async function authenticateAgent(c: Context<AppEnv>): Promise<TokenRow> {
  const match = TOKEN_PATTERN.exec(c.req.header("authorization") ?? "");
  if (!match?.[1]) throw new ApiError("unauthorized", "Agent token required.");
  const hash = await sha256Hex(match[1]);
  // A token works only while its owner's account is active and not being deleted, like a session.
  const row = await db(c.env).prepare(`SELECT t.id,t.project_id,t.name,t.tool,t.created_at,t.last_used_at,t.revoked_at FROM brain_agent_tokens t
    JOIN brain_projects p ON p.id=t.project_id JOIN users u ON u.id=p.user_id
    WHERE t.token_hash=? AND t.revoked_at IS NULL AND u.status='active'
      AND NOT EXISTS(SELECT 1 FROM account_deletions d WHERE d.user_id=u.id AND d.state='pending')`).bind(hash).first<TokenRow>();
  if (!row) throw new ApiError("unauthorized", "Agent token required.");
  await limit(c, { scope: "session", key: `brain-agent:${row.id}` });
  await db(c.env).prepare("UPDATE brain_agent_tokens SET last_used_at=? WHERE id=?").bind(c.get("deps").now().toISOString(), row.id).run();
  return row;
}
