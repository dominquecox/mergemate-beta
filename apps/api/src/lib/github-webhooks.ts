import type { ActivityEvent } from "@mergemate/contracts";
import type { Deps, Env } from "../env";
import { deliverGitHubPush } from "./github-push";
import { timingSafeEqual } from "./crypto";

const encoder = new TextEncoder();
const DELIVERY_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

const hmacHex = async (secret: string, body: ArrayBuffer) => {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, body));
  return Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
};

/**
 * Verifies `X-Hub-Signature-256` over the raw body. Accepts the current and the next secret so
 * the secret can rotate without dropping deliveries.
 */
export const verifyGitHubSignature = async (
  secrets: (string | undefined)[],
  body: ArrayBuffer,
  header: string | undefined,
) => {
  if (!header?.startsWith("sha256=")) return false;
  const given = header.slice("sha256=".length);
  let ok = false;
  for (const secret of secrets) {
    if (!secret) continue;
    // Check every secret so timing does not reveal which one matched.
    if (timingSafeEqual(await hmacHex(secret, body), given)) ok = true;
  }
  return ok;
};

interface Account {
  login: string;
  type: string;
}

export type WebhookData =
  | { kind: "installation"; action: string; installationId: string; account: Account; repos: RepoRef[] }
  | { kind: "installation_repositories"; installationId: string; added: RepoRef[]; removed: RepoRef[] }
  | { kind: "pr"; installationId: string | null; repo: string; numbers: number[]; headSha: string | null; event: ActivityEvent }
  | { kind: "status"; installationId: string | null; repo: string; sha: string };

export interface RepoRef {
  id: string;
  fullName: string;
}

export interface GitHubEventMessage {
  deliveryId: string;
  event: string;
  receivedAt: string;
  data: WebhookData;
}

type Json = Record<string, unknown>;

const obj = (v: unknown): Json | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null);
const str = (v: unknown) => (typeof v === "string" ? v : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const MAX_REPOS = 1000;

const repoRefs = (v: unknown): RepoRef[] =>
  (Array.isArray(v) ? v : []).slice(0, MAX_REPOS).flatMap((r) => {
    const id = num(obj(r)?.id);
    const fullName = str(obj(r)?.full_name);
    return id !== null && fullName ? [{ id: String(id), fullName }] : [];
  });

const installationId = (p: Json) => {
  const id = num(obj(p.installation)?.id);
  return id === null ? null : String(id);
};

const PR_EVENTS: Record<string, (action: string) => ActivityEvent> = {
  pull_request: (action) => (action === "opened" ? "opened" : action === "closed" ? "closed" : "updated"),
  pull_request_review: () => "review",
  pull_request_review_comment: () => "comment",
};

/**
 * Reduces a verified payload to the few ids the consumer needs, so queue messages stay small
 * and no repository content is kept. Returns null for events MergeMate ignores.
 */
export const toWebhookData = (event: string, payload: unknown): WebhookData | null => {
  const p = obj(payload);
  if (!p) return null;
  const action = str(p.action) ?? "";
  const repo = str(obj(p.repository)?.full_name);

  if (event === "installation") {
    const inst = obj(p.installation);
    const id = num(inst?.id);
    const account = obj(inst?.account);
    const login = str(account?.login);
    if (id === null || !login) return null;
    return {
      kind: "installation",
      action,
      installationId: String(id),
      account: { login, type: str(account?.type) ?? "User" },
      repos: repoRefs(p.repositories),
    };
  }
  if (event === "installation_repositories") {
    const id = installationId(p);
    if (!id) return null;
    return { kind: "installation_repositories", installationId: id, added: repoRefs(p.repositories_added), removed: repoRefs(p.repositories_removed) };
  }
  if (!repo) return null;

  const pr = PR_EVENTS[event];
  if (pr) {
    const pull = obj(p.pull_request);
    const number = num(pull?.number);
    if (number === null) return null;
    return {
      kind: "pr",
      installationId: installationId(p),
      repo,
      numbers: [number],
      headSha: str(obj(pull?.head)?.sha),
      event: pr(action),
    };
  }
  if (event === "issue_comment") {
    const issue = obj(p.issue);
    const number = num(issue?.number);
    if (number === null || !obj(issue?.pull_request)) return null; // comments on plain issues are ignored
    return { kind: "pr", installationId: installationId(p), repo, numbers: [number], headSha: null, event: "comment" };
  }
  if (event === "check_suite") {
    const suite = obj(p.check_suite);
    const numbers = (Array.isArray(suite?.pull_requests) ? suite.pull_requests : [])
      .map((x) => num(obj(x)?.number))
      .filter((n): n is number => n !== null)
      .slice(0, 100);
    if (!numbers.length) return null;
    return { kind: "pr", installationId: installationId(p), repo, numbers, headSha: str(suite?.head_sha), event: "checks" };
  }
  if (event === "status") {
    const sha = str(p.sha);
    return sha ? { kind: "status", installationId: installationId(p), repo, sha } : null;
  }
  return null;
};

const upsertActivity = (db: D1Database, repo: string, number: number, installation: string | null, headSha: string | null, event: ActivityEvent, at: string) =>
  db
    .prepare(
      `INSERT INTO pr_activity (repo_full_name, number, installation_id, head_sha, last_event, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (repo_full_name, number) DO UPDATE SET installation_id = COALESCE(excluded.installation_id, installation_id),
         head_sha = COALESCE(excluded.head_sha, head_sha), last_event = excluded.last_event, updated_at = excluded.updated_at`,
    )
    .bind(repo, number, installation, headSha, event, at);

/** Applies one message. Idempotent, so a retried message is safe. */
export const applyGitHubEvent = async (db: D1Database, message: GitHubEventMessage) => {
  const { data, receivedAt: at } = message;
  switch (data.kind) {
    case "installation": {
      if (data.action === "deleted") {
        await db.batch([
          db.prepare("DELETE FROM installation_repos WHERE installation_id = ?").bind(data.installationId),
          db.prepare("DELETE FROM installations WHERE id = ?").bind(data.installationId),
        ]);
        return;
      }
      const status = data.action === "suspend" ? "suspended" : "active";
      await db.batch([
        db
          .prepare(
            `INSERT INTO installations (id, account_login, account_type, status, updated_at) VALUES (?, ?, ?, ?, ?)
             ON CONFLICT (id) DO UPDATE SET account_login = excluded.account_login, account_type = excluded.account_type,
               status = excluded.status, updated_at = excluded.updated_at`,
          )
          .bind(data.installationId, data.account.login, data.account.type, status, at),
        ...data.repos.map((r) =>
          db
            .prepare("INSERT OR REPLACE INTO installation_repos (installation_id, repo_id, full_name) VALUES (?, ?, ?)")
            .bind(data.installationId, r.id, r.fullName),
        ),
      ]);
      return;
    }
    case "installation_repositories": {
      const known = await db.prepare("SELECT 1 FROM installations WHERE id = ?").bind(data.installationId).first();
      if (!known) return; // the installation event creates the row; repos are listed then
      await db.batch([
        ...data.added.map((r) =>
          db
            .prepare("INSERT OR REPLACE INTO installation_repos (installation_id, repo_id, full_name) VALUES (?, ?, ?)")
            .bind(data.installationId, r.id, r.fullName),
        ),
        ...data.removed.map((r) =>
          db.prepare("DELETE FROM installation_repos WHERE installation_id = ? AND repo_id = ?").bind(data.installationId, r.id),
        ),
      ]);
      return;
    }
    case "pr":
      await db.batch(data.numbers.map((n) => upsertActivity(db, data.repo, n, data.installationId, data.headSha, data.event, at)));
      return;
    case "status":
      await db
        .prepare("UPDATE pr_activity SET last_event = 'checks', updated_at = ? WHERE repo_full_name = ? AND head_sha = ?")
        .bind(at, data.repo, data.sha)
        .run();
      return;
  }
};

/** Queue consumer: ack each applied message, retry failures (the queue dead-letters after its retry limit). */
export const consumeGitHubEvents = async (batch: MessageBatch<GitHubEventMessage>, env: Env, now: Date, deps: Deps = { fetch, now: () => new Date() }) => {
  const db = env.DB;
  if (!db) {
    batch.retryAll();
    return;
  }
  for (const msg of batch.messages) {
    try {
      await applyGitHubEvent(db, msg.body);
      // Event writes can retry; push delivery is best effort and independently claimed.
      try { await deliverGitHubPush(env, deps, msg.body); } catch { /* Never retry an applied event for push failures. */ }
      msg.ack();
    } catch {
      msg.retry();
    }
  }
  await db
    .prepare("DELETE FROM github_deliveries WHERE received_at < ?")
    .bind(new Date(now.getTime() - DELIVERY_RETENTION_MS).toISOString())
    .run();
};

/** Dead-letter consumer: keeps a record (ids only, no payload) of messages that exhausted retries. */
export const recordDeadLetters = async (
  batch: MessageBatch<Partial<GitHubEventMessage>>,
  env: Env,
  source: string,
  now: Date,
) => {
  const db = env.DB;
  if (!db) {
    batch.retryAll();
    return;
  }
  await db.batch(
    batch.messages.map((m) =>
      db
        .prepare("INSERT INTO webhook_dead_letters (source, delivery_id, event, failed_at) VALUES (?, ?, ?, ?)")
        .bind(source, m.body?.deliveryId ?? null, m.body?.event ?? null, now.toISOString()),
    ),
  );
  batch.ackAll();
};
