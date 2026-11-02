import type { ActivityEvent, ActivityResponse } from "@mergemate/contracts";
import { Hono } from "hono";
import { requireBinding } from "../config";
import type { AppEnv } from "../env";
import { base64url, sha256Hex } from "../lib/crypto";
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
  const session = c.get("session");
  let until = now.toISOString();
  let from = new Date(Math.max(since, now.getTime() - MAX_LOOKBACK_MS)).toISOString();

  const limit=Number(c.req.query('limit') ?? MAX_ITEMS);
  if(!Number.isInteger(limit) || limit<1 || limit>100)throw new ApiError('validation_failed','Invalid limit.');
  const scope = await sha256Hex(JSON.stringify([session.userId, sinceParam, limit]));
  let cursor: {at:string;repo:string;number:number;until:string;from:string;scope:string}|null=null;
  if(c.req.query('cursor')){
    try{
      if((c.req.query('cursor') ?? '').length>512)throw new Error();
      const raw=JSON.parse(atob((c.req.query('cursor') ?? '').replace(/-/g,'+').replace(/_/g,'/'))) as {at:string;repo:string;number:number;until:string;from:string;scope:string};
      if(!Number.isFinite(Date.parse(raw.at)) || typeof raw.repo!=='string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(raw.repo) || !Number.isInteger(raw.number) || raw.number<1)throw new Error();
      if(raw.scope!==scope || !Number.isFinite(Date.parse(raw.until)) || !Number.isFinite(Date.parse(raw.from)) || Date.parse(raw.until)>now.getTime() || Date.parse(raw.from)>Date.parse(raw.until))throw new Error();
      cursor=raw;until=raw.until;from=raw.from;
    }catch{throw new ApiError('validation_failed','Invalid cursor.');}
  }
  if (session.demo || !session.userId) {
    return c.json({ items: [], serverTime: now.toISOString(), nextCursor:null } satisfies ActivityResponse & {nextCursor:null});
  }
  await refreshRepoAccess(c, session.userId);

  const rows = await requireBinding(c.env, "DB")
    .prepare(
      `SELECT a.repo_full_name, a.number, a.last_event, a.updated_at
       FROM pr_activity a
       JOIN user_repo_access r ON r.user_id = ?1 AND r.full_name = a.repo_full_name COLLATE NOCASE
       WHERE a.updated_at > ?2 AND a.updated_at <= ?6
         AND (?3 IS NULL OR a.updated_at < ?3 OR (a.updated_at = ?3 AND a.repo_full_name > ?4) OR (a.updated_at = ?3 AND a.repo_full_name = ?4 AND a.number > ?5))
         AND NOT EXISTS (
           SELECT 1 FROM repo_watch w
           WHERE w.user_id = ?1 AND w.watching = 0 AND w.full_name = a.repo_full_name COLLATE NOCASE
         )
       ORDER BY a.updated_at DESC, a.repo_full_name ASC, a.number ASC
       LIMIT ${limit+1}`,
    )
    .bind(session.userId, from, cursor?.at ?? null,cursor?.repo ?? null,cursor?.number ?? null,until)
    .all<{ repo_full_name: string; number: number; last_event: ActivityEvent; updated_at: string }>();

  const visible=rows.results.slice(0,limit);
  const last=visible.at(-1);
  const res: ActivityResponse & {nextCursor:string|null} = {
    nextCursor:rows.results.length>limit && last?base64url(new TextEncoder().encode(JSON.stringify({at:last.updated_at,repo:last.repo_full_name,number:last.number,until,from,scope}))):null,
    items: visible.map((r) => ({ repo: r.repo_full_name, number: r.number, event: r.last_event, updatedAt: r.updated_at })),
    serverTime: now.toISOString(),
  };
  return c.json(res);
});
