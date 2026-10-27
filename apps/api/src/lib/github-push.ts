import type { NotificationKind } from "@mergemate/contracts";
import { requireBinding } from "../config";
import type { Deps, Env } from "../env";
import { githubGet } from "./github";
import { getAccessToken } from "./github-tokens";
import type { GitHubEventMessage } from "./github-webhooks";
import { notificationId } from "./notification-id";
import { sendPushNotification } from "./push";
import { refreshUserRepoAccess } from "./repo-access";

// Match inbox priority. Resolve membership using GitHub with each recipient's own token;
// webhook content, authors and mention strings never authorize a recipient.
const queries: { kind: NotificationKind; qualifier: string }[] = [
  { kind: "review", qualifier: "review-requested:@me" },
  { kind: "mention", qualifier: "mentions:@me" },
  { kind: "mine", qualifier: "author:@me" },
];

/** Best-effort delivery. Claims outlive receipts/devices so re-registration cannot resend. */
export async function deliverGitHubPush(env: Env, deps: Deps, message: GitHubEventMessage) {
  const db = requireBinding(env, "DB");
  const data = message.data;
  if (data.kind !== "pr" && data.kind !== "status") return;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(data.repo)) return;
  const numbers = data.kind === "pr" ? data.numbers : (await db.prepare(
    "SELECT number FROM pr_activity WHERE repo_full_name=? AND head_sha=?",
  ).bind(data.repo, data.sha).all<{ number: number }>()).results.map((row) => row.number);
  if (!numbers.length) return;

  // Page through registered recipients rather than truncating a repository's audience.
  let after = "";
  for (;;) {
    // Only users who may read this repo: those whose last access check listed it, or who were never
    // checked yet. Everyone else is skipped without GitHub calls, so a busy repo cannot exhaust the
    // Worker's subrequest budget on unrelated users. Candidates are still re-verified below.
    const users = await db.prepare(`SELECT u.id FROM users u WHERE u.status='active' AND u.id>?
      AND EXISTS(SELECT 1 FROM push_tokens p WHERE p.user_id=u.id)
      AND (EXISTS(SELECT 1 FROM user_repo_access a WHERE a.user_id=u.id AND a.full_name=? COLLATE NOCASE)
        OR NOT EXISTS(SELECT 1 FROM user_access_checks c WHERE c.user_id=u.id))
      ORDER BY u.id LIMIT 100`).bind(after, data.repo).all<{ id: string }>();
    if (!users.results.length) return;
    for (const user of users.results) {
      after = user.id;
      try {
        const muted = await db.prepare("SELECT 1 FROM repo_watch WHERE user_id=? AND full_name=? COLLATE NOCASE AND watching=0")
          .bind(user.id, data.repo).first();
        if (muted) continue;
        for (const number of numbers) {
          if (!Number.isSafeInteger(number) || number <= 0) continue;
          const id = notificationId(data.repo, number);
          if (await db.prepare("SELECT 1 FROM notification_push WHERE user_id=? AND notification_id=?").bind(user.id, id).first()) continue;
          // Refresh immediately before inspecting cached activity or creating a push.
          // An expired/failed access check fails closed; stale rows never grant access.
          await refreshUserRepoAccess(env, deps, user.id);
          if (!(await db.prepare("SELECT 1 FROM user_repo_access WHERE user_id=? AND full_name=? COLLATE NOCASE")
            .bind(user.id, data.repo).first())) break;
          const token = await getAccessToken(env, user.id, deps.now());
          let kind: NotificationKind | undefined;
          for (const query of queries) {
            const q = `repo:${data.repo} is:pr is:open archived:false ${query.qualifier}`;
            // Use the same supported qualifiers and 1,000-result ceiling as the inbox.
            // Exact numeric matching happens locally, never through a text/title search.
            for (let page = 1; page <= 10; page++) {
              const result = await githubGet<{ items: { number: number }[]; total_count: number; incomplete_results: boolean }>(
                deps, token, `/search/issues?q=${encodeURIComponent(q)}&sort=updated&order=desc&per_page=100&page=${page}`,
              );
              if (result.incomplete_results) throw new Error("Incomplete notification lookup");
              if (result.items.some((item) => item.number === number)) { kind = query.kind; break; }
              if (page * 100 >= result.total_count || result.items.length < 100) break;
            }
            if (kind) break;
          }
          if (!kind) continue;
          const hidden = await db.prepare(`SELECT 1 FROM notification_state WHERE user_id=? AND item_id=?
            AND (snoozed_until>? OR done_at>=?)`).bind(user.id, id, deps.now().toISOString(), message.receivedAt).first();
          if (hidden) continue;
          // Search pagination can outlive the access TTL. Recheck before the claim/send.
          await refreshUserRepoAccess(env, deps, user.id);
          if (!(await db.prepare("SELECT 1 FROM user_repo_access WHERE user_id=? AND full_name=? COLLATE NOCASE")
            .bind(user.id, data.repo).first())) break;
          const claim = await db.prepare(`INSERT INTO notification_push(user_id,notification_id,kind,claimed_at)
            VALUES(?,?,?,?) ON CONFLICT(user_id,notification_id) DO NOTHING`)
            .bind(user.id, id, kind, deps.now().toISOString()).run();
          if (claim.meta.changes !== 1) continue;
          // No provider retry, including explicit 5xx. An accepted send with a lost
          // response (or a crash before recording the outcome) must remain claimed.
          let outcome = "failed";
          try {
            const sent = await sendPushNotification(env, deps, { userId: user.id, kind, notificationId: id }, { retry: false });
            outcome = sent.suppressed ? "suppressed" : sent.accepted > 0 ? "accepted" : "failed";
          } catch { /* A push failure must not retry this queue message. */ }
          await db.prepare("UPDATE notification_push SET outcome=? WHERE user_id=? AND notification_id=?")
            .bind(outcome, user.id, id).run();
        }
      } catch { /* Isolate access/provider/storage failures to this recipient; fail closed. */ }
    }
  }
}
