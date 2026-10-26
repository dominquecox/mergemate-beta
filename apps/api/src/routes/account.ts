import { Hono } from "hono";
import { requireBinding, requireVar } from "../config";
import type { AppEnv } from "../env";
import { ApiError } from "../errors";
import { GITHUB_API } from "../lib/github";
import { getAccessToken } from "../lib/github-tokens";
import { clearedSessionCookie } from "../lib/sessions";

/**
 * Revokes the user's grant for this GitHub App (an app-level call authenticated with the
 * client credentials, not a write to any repository). A grant that is already gone counts as revoked.
 */
const revokeGrant = async (
  fetcher: typeof fetch,
  clientId: string,
  clientSecret: string,
  accessToken: string,
) => {
  let res: Response;
  try {
    res = await fetcher(`${GITHUB_API}/applications/${encodeURIComponent(clientId)}/grant`, {
      method: "DELETE",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        "content-type": "application/json",
        "user-agent": "MergeMate",
        "x-github-api-version": "2022-11-28",
      },
      body: JSON.stringify({ access_token: accessToken }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new ApiError("upstream_unavailable", "Could not reach GitHub to revoke access. Try again.");
  }
  if (res.status === 204 || res.status === 404 || res.status === 422) return;
  throw new ApiError("upstream_unavailable", "Could not revoke GitHub access. Try again.");
};

export const account = new Hono<AppEnv>().delete("/account", async (c) => {
  const session = c.get("session");
  const userId = session.userId;
  if (!userId) throw new ApiError("forbidden", "Not available in the demo.");
  const db = requireBinding(c.env, "DB");
  const deps = c.get("deps");

  let accessToken: string | null = null;
  try {
    accessToken = await getAccessToken(c.env, userId, deps.now());
  } catch (err) {
    // No usable token means GitHub no longer holds a grant we can reach; anything else is retried.
    if (!(err instanceof ApiError && err.code === "unauthorized")) throw err;
  }
  if (accessToken) {
    await revokeGrant(
      deps.fetch,
      requireVar(c.env, "GITHUB_APP_CLIENT_ID"),
      requireVar(c.env, "GITHUB_APP_CLIENT_SECRET"),
      accessToken,
    );
  }

  await db.batch([
    db.prepare("DELETE FROM notification_state WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM repo_watch WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM github_tokens WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM users WHERE id = ?").bind(userId),
  ]);
  if (session.transport === "cookie") c.header("set-cookie", clearedSessionCookie());
  return c.body(null, 204);
});
