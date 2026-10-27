import {
  type Notification,
  NotificationFilter,
  type NotificationKind,
  type NotificationPage,
  SnoozeRequest,
} from "@mergemate/contracts";
import { type Context, Hono } from "hono";
import { requireBinding } from "../config";
import type { AppEnv, Deps, Env } from "../env";
import { ApiError } from "../errors";
import { notificationId } from "../lib/notification-id";
export { notificationId } from "../lib/notification-id";
import { githubGet } from "../lib/github";
import { getAccessToken } from "../lib/github-tokens";
import { parseBody, parseValue } from "../lib/validate";
import { prStatus } from "./github";
import { DEMO_NOTIFICATIONS } from "./github.fixtures";

const PAGE_SIZE = 50;
const MAX_PAGE = 20; // GitHub search returns at most 1,000 results
const STATE_CHUNK = 90;
const MAX_SNOOZE_MS = 365 * 24 * 60 * 60 * 1000;

// Highest priority first: an item matching several queries keeps the first kind.
const QUERIES: { kind: NotificationKind; filter: NotificationFilter; q: string }[] = [
  { kind: "review", filter: "review", q: "is:pr is:open archived:false review-requested:@me" },
  { kind: "mention", filter: "mentions", q: "is:pr is:open archived:false mentions:@me" },
  { kind: "mine", filter: "mine", q: "is:pr is:open archived:false author:@me" },
];

interface SearchItem {
  number: number;
  title: string;
  state: string;
  draft?: boolean;
  user: { login: string } | null;
  updated_at: string;
  repository_url: string;
  pull_request?: { merged_at: string | null };
}

const ITEM_ID = /^[A-Za-z0-9_-]{8,400}$/;

const parseItemId = (id: string) => {
  if (!ITEM_ID.test(id) && !/^demo\.[A-Za-z0-9_.-]+$/.test(id)) {
    throw new ApiError("validation_failed", "The notification id is not valid.");
  }
  return id;
};

const userId = (c: Context<AppEnv>) => {
  const id = c.get("session").userId;
  if (!id) throw new ApiError("forbidden", "Not available in the demo.");
  return id;
};

/**
 * One page of the user's open inbox, built with the user's own GitHub token so GitHub enforces
 * their access, minus done and snoozed items and muted repositories. Shared by the inbox and the
 * triage queue so both apply the same source and rules.
 */
export const loadInbox = async (
  env: Env,
  deps: Deps,
  uid: string,
  filter: NotificationFilter,
  page: number,
): Promise<NotificationPage> => {
  const now = deps.now();
  const token = await getAccessToken(env, uid, now);
  const queries = QUERIES.filter((q) => filter === "all" || q.filter === filter);
  const results = await Promise.all(
    queries.map((q) =>
      githubGet<{ total_count: number; items: SearchItem[] }>(
        deps,
        token,
        `/search/issues?q=${encodeURIComponent(q.q)}&sort=updated&order=desc&per_page=${PAGE_SIZE}&page=${page}`,
      ),
    ),
  );

  const byId = new Map<string, Notification>();
  results.forEach((result, i) => {
    const kind = queries[i]?.kind;
    if (!kind) return;
    for (const item of result.items) {
      const repo = item.repository_url.split("/repos/")[1];
      if (!repo) continue;
      const id = notificationId(repo, item.number);
      if (byId.has(id)) continue;
      byId.set(id, {
        id,
        kind,
        repo,
        number: item.number,
        title: item.title,
        author: item.user?.login ?? "ghost",
        status: prStatus({ state: item.state, draft: item.draft ?? false, merged_at: item.pull_request?.merged_at ?? null }),
        updatedAt: item.updated_at,
        read: false,
      });
    }
  });

  const db = requireBinding(env, "DB");
  const ids = [...byId.keys()];
  const hidden = new Set<string>();
  // D1 allows 100 bound values per statement, so look the ids up in chunks.
  for (let i = 0; i < ids.length; i += STATE_CHUNK) {
    const chunk = ids.slice(i, i + STATE_CHUNK);
    const states = await db
      .prepare(
        `SELECT item_id, done_at, snoozed_until FROM notification_state
         WHERE user_id = ? AND item_id IN (${chunk.map(() => "?").join(",")})`,
      )
      .bind(uid, ...chunk)
      .all<{ item_id: string; done_at: string | null; snoozed_until: string | null }>();
    for (const s of states.results) {
      const item = byId.get(s.item_id);
      // Done stays done until the pull request changes again; snooze hides it until the time passes.
      if (item && s.done_at && Date.parse(item.updatedAt) <= Date.parse(s.done_at)) hidden.add(s.item_id);
      if (s.snoozed_until && Date.parse(s.snoozed_until) > now.getTime()) hidden.add(s.item_id);
    }
  }
  const unwatched = await db
    .prepare("SELECT full_name FROM repo_watch WHERE user_id = ? AND watching = 0")
    .bind(uid)
    .all<{ full_name: string }>();
  const muted = new Set(unwatched.results.map((r) => r.full_name.toLowerCase()));

  const items = [...byId.values()]
    .filter((n) => !hidden.has(n.id) && !muted.has(n.repo.toLowerCase()))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const more = page < MAX_PAGE && results.some((r) => r.total_count > page * PAGE_SIZE);
  return { items, nextCursor: more ? String(page + 1) : null };
};

export const notifications = new Hono<AppEnv>()
  .get("/notifications", async (c) => {
    const filter = parseValue(NotificationFilter, c.req.query("filter") ?? "all");
    const cursor = c.req.query("cursor");
    const page = cursor ? Number(cursor) : 1;
    if (!Number.isInteger(page) || page < 1 || page > MAX_PAGE) {
      throw new ApiError("validation_failed", "The cursor is not valid.");
    }

    if (c.get("session").demo) {
      const items = DEMO_NOTIFICATIONS.filter((n) => filter === "all" || n.kind === QUERIES.find((q) => q.filter === filter)?.kind);
      return c.json({ items, nextCursor: null } satisfies NotificationPage);
    }

    return c.json(await loadInbox(c.env, c.get("deps"), userId(c), filter, page));
  })

  .post("/notifications/:id/done", async (c) => {
    const id = parseItemId(c.req.param("id"));
    const now = c.get("deps").now().toISOString();
    await requireBinding(c.env, "DB")
      .prepare(
        `INSERT INTO notification_state (user_id, item_id, done_at, snoozed_until, updated_at) VALUES (?, ?, ?, NULL, ?)
         ON CONFLICT (user_id, item_id) DO UPDATE SET done_at = excluded.done_at, snoozed_until = NULL, updated_at = excluded.updated_at`,
      )
      .bind(userId(c), id, now, now)
      .run();
    return c.body(null, 204);
  })

  .post("/notifications/:id/snooze", async (c) => {
    const id = parseItemId(c.req.param("id"));
    const { until } = await parseBody(c, SnoozeRequest);
    const now = c.get("deps").now();
    const untilMs = Date.parse(until);
    if (untilMs <= now.getTime() || untilMs - now.getTime() > MAX_SNOOZE_MS) {
      throw new ApiError("validation_failed", "Snooze time must be in the future and within a year.");
    }
    await requireBinding(c.env, "DB")
      .prepare(
        `INSERT INTO notification_state (user_id, item_id, done_at, snoozed_until, updated_at) VALUES (?, ?, NULL, ?, ?)
         ON CONFLICT (user_id, item_id) DO UPDATE SET snoozed_until = excluded.snoozed_until, done_at = NULL, updated_at = excluded.updated_at`,
      )
      .bind(userId(c), id, new Date(untilMs).toISOString(), now.toISOString())
      .run();
    return c.body(null, 204);
  })

  // Undo for done and snooze.
  .post("/notifications/:id/restore", async (c) => {
    const id = parseItemId(c.req.param("id"));
    await requireBinding(c.env, "DB")
      .prepare("DELETE FROM notification_state WHERE user_id = ? AND item_id = ?")
      .bind(userId(c), id)
      .run();
    return c.body(null, 204);
  });
