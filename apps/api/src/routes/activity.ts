import type { ActivityEvent, ActivityResponse } from "@mergemate/contracts";
import { Hono } from "hono";
import { requireBinding } from "../config";
import type { AppEnv } from "../env";
import { ApiError } from "../errors";
import { refreshRepoAccess } from "../lib/repo-access";

const MAX_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const MAX_ITEMS = 100;

/**
 * Pull requests that changed on GitHub (from webhooks) since `since`, limited to repositories
 * the user can read and still watches. The app polls this and refetches what changed.
 */
export const activity = new Hono<AppEnv>().get("/activity", async (c) => {
  const now = c.get("deps").now();
  const sinceParam = c.req.query("since");
  const since = sinceParam ? Date.parse(sinceParam) : Number.NaN;
  if (Number.isNaN(since)) throw new ApiError("validation_failed", "`since` must be an ISO-8601 time.");
  const from = new Date(Math.max(since, now.getTime() - MAX_LOOKBACK_MS)).toISOString();

  const session = c.get("session");
  if (session.demo || !session.userId) {
    return c.json({ items: [], serverTime: now.toISOString() } satisfies ActivityResponse);
  }
  await refreshRepoAccess(c, session.userId);

  const rows = await requireBinding(c.env, "DB")
    .prepare(
      `SELECT a.repo_full_name, a.number, a.last_event, a.updated_at
       FROM pr_activity a
       JOIN user_repo_access r ON r.user_id = ?1 AND r.full_name = a.repo_full_name COLLATE NOCASE
       WHERE a.updated_at > ?2
         AND NOT EXISTS (
           SELECT 1 FROM repo_watch w
           WHERE w.user_id = ?1 AND w.watching = 0 AND w.full_name = a.repo_full_name COLLATE NOCASE
         )
       ORDER BY a.updated_at DESC
       LIMIT ${MAX_ITEMS}`,
    )
    .bind(session.userId, from)
    .all<{ repo_full_name: string; number: number; last_event: ActivityEvent; updated_at: string }>();

  const res: ActivityResponse = {
    items: rows.results.map((r) => ({ repo: r.repo_full_name, number: r.number, event: r.last_event, updatedAt: r.updated_at })),
    serverTime: now.toISOString(),
  };
  return c.json(res);
});
