import { requireBinding, requireVar } from "../config";
import type { Deps, Env, RefreshOutcome } from "../env";
import { ApiError } from "../errors";
import { createTokenCipher } from "./crypto";
import { type GitHubTokens, requestTokens } from "./github";

// Refresh this long before expiry so a request never starts with a token about to lapse.
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

interface TokenRow {
  key_version: string;
  access_token: string;
  access_expires_at: string | null;
  refresh_token: string | null;
  refresh_expires_at: string | null;
}

const context = (userId: string, field: "access" | "refresh") => `github:${field}:${userId}`;

export const saveTokens = async (env: Env, userId: string, tokens: GitHubTokens, now: Date) => {
  const cipher = await createTokenCipher(env);
  const access = await cipher.encrypt(tokens.accessToken, context(userId, "access"));
  const refresh = tokens.refreshToken ? await cipher.encrypt(tokens.refreshToken, context(userId, "refresh")) : null;
  await requireBinding(env, "DB")
    .prepare(
      `INSERT INTO github_tokens (user_id, key_version, access_token, access_expires_at, refresh_token, refresh_expires_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET key_version = excluded.key_version, access_token = excluded.access_token,
         access_expires_at = excluded.access_expires_at, refresh_token = excluded.refresh_token,
         refresh_expires_at = excluded.refresh_expires_at, updated_at = excluded.updated_at`,
    )
    .bind(userId, cipher.version, access, tokens.accessExpiresAt, refresh, tokens.refreshExpiresAt, now.toISOString())
    .run();
};

const loadRow = (env: Env, userId: string) =>
  requireBinding(env, "DB")
    .prepare(
      "SELECT key_version, access_token, access_expires_at, refresh_token, refresh_expires_at FROM github_tokens WHERE user_id = ?",
    )
    .bind(userId)
    .first<TokenRow>();

const isFresh = (row: TokenRow, now: Date) =>
  row.access_expires_at === null || Date.parse(row.access_expires_at) - REFRESH_MARGIN_MS > now.getTime();

const decryptAccess = async (env: Env, userId: string, row: TokenRow) =>
  (await createTokenCipher(env)).decrypt(row.key_version, row.access_token, context(userId, "access"));

const reauth = () => new ApiError("unauthorized", "GitHub access expired. Sign in again.");

/**
 * Returns a usable GitHub user token. An expiring token is refreshed through the user's
 * Durable Object, so parallel requests never spend the single-use refresh token twice.
 */
export const getAccessToken = async (env: Env, userId: string, now: Date): Promise<string> => {
  let row = await loadRow(env, userId);
  if (!row) throw reauth();
  if (!isFresh(row, now)) {
    const refresher = requireBinding(env, "TOKEN_REFRESHER");
    const outcome = await refresher.get(refresher.idFromName(userId)).refresh(userId);
    if (outcome === "reauth") throw reauth();
    if (outcome === "unavailable") throw new ApiError("upstream_unavailable", "GitHub is unavailable. Try again.");
    row = await loadRow(env, userId);
    if (!row) throw reauth();
  }
  return decryptAccess(env, userId, row);
};

/** Exact encrypted-row snapshot for deletion fencing; never returned to clients or logs. */
export const getDeletionTokenSnapshot=async(env:Env,userId:string,now:Date)=>{
  await getAccessToken(env,userId,now);
  const row=await loadRow(env,userId);if(!row)throw reauth();
  return {token:await decryptAccess(env,userId,row),encryptedAccess:row.access_token};
};

/**
 * The refresh itself. Runs inside the per-user Durable Object (serialized), and re-checks
 * freshness first because a queued caller may find the work already done.
 */
export const refreshTokens = async (env: Env, deps: Deps, userId: string): Promise<RefreshOutcome> => {
  try {
    const now = deps.now();
    const row = await loadRow(env, userId);
    if (!row) return "reauth";
    if (isFresh(row, now)) return "ok";
    if (!row.refresh_token || (row.refresh_expires_at && Date.parse(row.refresh_expires_at) <= now.getTime())) {
      return "reauth";
    }
    const cipher = await createTokenCipher(env);
    const refreshToken = await cipher.decrypt(row.key_version, row.refresh_token, context(userId, "refresh"));
    const result = await requestTokens(deps, {
      client_id: requireVar(env, "GITHUB_APP_CLIENT_ID"),
      client_secret: requireVar(env, "GITHUB_APP_CLIENT_SECRET"),
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
    if (!result.ok) return "reauth";
    await saveTokens(env, userId, result.tokens, now);
    return "ok";
  } catch {
    return "unavailable";
  }
};
