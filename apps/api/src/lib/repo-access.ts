import type { Context } from "hono";
import { requireBinding } from "../config";
import type { AppEnv, Deps, Env } from "../env";
import { githubGet } from "./github";
import { getAccessToken } from "./github-tokens";

const ACCESS_TTL_MS = 10 * 60 * 1000;
const MAX_PAGES = 10; // per installation, 100 repos per page

interface Installations {
  installations: { id: number; suspended_at: string | null }[];
}

/**
 * Makes sure user_repo_access lists what the user's own token can read through MergeMate,
 * re-checking with GitHub when the last check is older than 10 minutes. Cached and
 * webhook-derived data is shown only for repositories in this list.
 */
export const refreshRepoAccess = async (c: Context<AppEnv>, userId: string) => {
  return refreshUserRepoAccess(c.env, c.get("deps"), userId);
};

/** Shared by authenticated HTTP reads and background notification delivery. */
export const refreshUserRepoAccess = async (env: Env, deps: Deps, userId: string) => {
  const db = requireBinding(env, "DB");
  const now = deps.now();
  const check = await db
    .prepare("SELECT checked_at FROM user_access_checks WHERE user_id = ?")
    .bind(userId)
    .first<{ checked_at: string }>();
  const age = check ? now.getTime() - Date.parse(check.checked_at) : NaN;
  if (age >= 0 && age < ACCESS_TTL_MS) return;

  const token = await getAccessToken(env, userId, now);
  const { installations } = await githubGet<Installations>(deps, token, "/user/installations?per_page=100");
  const names = new Set<string>();
  for (const inst of installations.filter((i) => !i.suspended_at)) {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await githubGet<{ total_count: number; repositories: { full_name: string }[] }>(
        deps,
        token,
        `/user/installations/${inst.id}/repositories?per_page=100&page=${page}`,
      );
      for (const r of res.repositories) names.add(r.full_name);
      if (page * 100 >= res.total_count) break;
    }
  }

  await db.batch([
    db.prepare("DELETE FROM user_repo_access WHERE user_id = ?").bind(userId),
    ...[...names].map((name) =>
      db.prepare("INSERT OR IGNORE INTO user_repo_access (user_id, full_name) VALUES (?, ?)").bind(userId, name),
    ),
    db
      .prepare(
        `INSERT INTO user_access_checks (user_id, checked_at) VALUES (?, ?)
         ON CONFLICT (user_id) DO UPDATE SET checked_at = excluded.checked_at`,
      )
      .bind(userId, now.toISOString()),
  ]);
};
