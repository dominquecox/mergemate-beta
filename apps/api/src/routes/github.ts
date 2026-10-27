import {
  type CheckState,
  type Installation,
  type InstallationList,
  type PrCheck,
  type MergeState,
  type PrDetail,
  type PrStatus,
  type PrThread,
  type RepoPage,
  RepoWatchRequest,
} from "@mergemate/contracts";
import { type Context, Hono } from "hono";
import { requireBinding, requireVar } from "../config";
import type { AppEnv, Deps } from "../env";
import { ApiError } from "../errors";
import { base64url } from "../lib/crypto";
import { GITHUB_WEB, githubGet } from "../lib/github";
import { getAccessToken } from "../lib/github-tokens";
import { parseBody } from "../lib/validate";
import { DEMO_INSTALLATIONS, DEMO_PRS, DEMO_REPOS } from "./github.fixtures";

const PAGE_SIZE = 50;
const FILE_PAGES = 3; // up to 300 files
const NAME = /^[A-Za-z0-9_.-]{1,100}$/;

const userToken = (c: Context<AppEnv>) => {
  const { userId } = c.get("session");
  if (!userId) throw new ApiError("forbidden", "Not available in the demo.");
  return getAccessToken(c.env, userId, c.get("deps").now());
};

interface GhInstallation {
  id: number;
  account: { login: string; type: string } | null;
  suspended_at: string | null;
  html_url: string;
}

const listInstallations = async (c: Context<AppEnv>, token: string) => {
  const res = await githubGet<{ installations: GhInstallation[] }>(c.get("deps"), token, "/user/installations?per_page=100");
  return res.installations;
};

const installUrl = (c: Context<AppEnv>) =>
  `${GITHUB_WEB}/apps/${encodeURIComponent(requireVar(c.env, "GITHUB_APP_SLUG"))}/installations/new`;

interface RepoCursor {
  i: number;
  p: number;
}

const encodeCursor = (cursor: RepoCursor) => base64url(new TextEncoder().encode(JSON.stringify(cursor)));

const decodeCursor = (value: string | undefined): RepoCursor => {
  if (!value) return { i: 0, p: 1 };
  try {
    const parsed = JSON.parse(atob(value.replace(/-/g, "+").replace(/_/g, "/"))) as RepoCursor;
    if (Number.isInteger(parsed.i) && Number.isInteger(parsed.p) && parsed.i >= 0 && parsed.p >= 1 && parsed.p <= 1000) {
      return parsed;
    }
  } catch {
    // fall through
  }
  throw new ApiError("validation_failed", "The cursor is not valid.");
};

interface GhPull {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  draft?: boolean;
  merged_at: string | null;
  user: { login: string } | null;
  base: { ref: string };
  head: { ref: string; sha: string };
  additions: number;
  deletions: number;
  changed_files: number;
  created_at: string;
  updated_at: string;
  html_url: string;
  /** null while GitHub computes mergeability in the background. */
  mergeable?: boolean | null;
  mergeable_state?: string;
}

interface GhFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

interface GhCheckRun {
  name: string;
  status: "queued" | "in_progress" | "completed" | string;
  conclusion: string | null;
  html_url: string | null;
}

interface GhStatus {
  context: string;
  state: "error" | "failure" | "pending" | "success";
  target_url: string | null;
}

interface GhComment {
  id: number;
  user: { login: string } | null;
  body: string;
  created_at: string;
  path?: string;
  line?: number | null;
  in_reply_to_id?: number;
}

/** Maps GitHub's mergeability onto MergeState. Only open pull requests have one. */
export const mergeStateOf = (pr: Pick<GhPull, "state" | "merged_at" | "mergeable" | "mergeable_state">): MergeState | undefined => {
  if (pr.state !== "open" || pr.merged_at) return undefined;
  if (pr.mergeable === false || pr.mergeable_state === "dirty") return "conflicts";
  if (pr.mergeable === null || pr.mergeable === undefined) return "unknown";
  switch (pr.mergeable_state) {
    case "clean":
    case "has_hooks":
      return "clean";
    case "blocked":
      return "blocked";
    case "behind":
      return "behind";
    case "unstable":
      return "unstable";
    default:
      return "unknown";
  }
};

export const prStatus = (pr: { state: string; draft?: boolean; merged_at?: string | null }): PrStatus => {
  if (pr.merged_at) return "merged";
  if (pr.state === "closed") return "closed";
  return pr.draft ? "draft" : "open";
};

const checkRunState = (run: GhCheckRun): CheckState => {
  if (run.status !== "completed") return run.status === "in_progress" ? "in_progress" : "queued";
  switch (run.conclusion) {
    case "success":
      return "success";
    case "neutral":
      return "neutral";
    case "skipped":
      return "skipped";
    case "cancelled":
      return "cancelled";
    default:
      return "failure";
  }
};

const STATUS_STATE: Record<GhStatus["state"], CheckState> = {
  success: "success",
  pending: "queued",
  failure: "failure",
  error: "failure",
};

const httpsUrl = (value: string | null) => (value?.startsWith("https://") ? { url: value } : {});

const toThreads = (review: GhComment[], conversation: GhComment[]): PrThread[] => {
  const comment = (c: GhComment) => ({
    id: String(c.id),
    author: c.user?.login ?? "ghost",
    body: c.body,
    createdAt: c.created_at,
  });
  const threads = new Map<number, PrThread>();
  for (const c of review) {
    const root = c.in_reply_to_id ?? c.id;
    const thread = threads.get(root) ?? { id: String(root), path: c.path ?? null, line: c.line ?? null, comments: [] };
    thread.comments.push(comment(c));
    threads.set(root, thread);
  }
  const result = [...threads.values()];
  if (conversation.length) result.unshift({ id: "conversation", path: null, line: null, comments: conversation.map(comment) });
  return result;
};

/**
 * Fetches pull request detail with the user's own token, so GitHub enforces
 * their access to the repository. Up to 300 files with patches, plus checks
 * and threads.
 */
export const fetchPrDetail = async (
  deps: Deps,
  token: string,
  owner: string,
  repo: string,
  number: number,
): Promise<PrDetail> => {
  const base = `/repos/${owner}/${repo}`;
  const pull = await githubGet<GhPull>(deps, token, `${base}/pulls/${number}`);

  const filePages = Math.min(FILE_PAGES, Math.max(1, Math.ceil(pull.changed_files / 100)));
  const [files, checkRuns, statuses, review, conversation] = await Promise.all([
    Promise.all(
      Array.from({ length: filePages }, (_, i) =>
        githubGet<GhFile[]>(deps, token, `${base}/pulls/${number}/files?per_page=100&page=${i + 1}`),
      ),
    ).then((pages) => pages.flat()),
    githubGet<{ check_runs: GhCheckRun[] }>(deps, token, `${base}/commits/${pull.head.sha}/check-runs?per_page=100`),
    githubGet<{ statuses: GhStatus[] }>(deps, token, `${base}/commits/${pull.head.sha}/status?per_page=100`),
    githubGet<GhComment[]>(deps, token, `${base}/pulls/${number}/comments?per_page=100`),
    githubGet<GhComment[]>(deps, token, `${base}/issues/${number}/comments?per_page=100`),
  ]);

  const checks: PrCheck[] = [
    ...checkRuns.check_runs.map((run) => ({ name: run.name, state: checkRunState(run), ...httpsUrl(run.html_url) })),
    ...statuses.statuses.map((s) => ({ name: s.context, state: STATUS_STATE[s.state], ...httpsUrl(s.target_url) })),
  ];
  return {
    repo: `${owner}/${repo}`,
    number: pull.number,
    title: pull.title,
    body: pull.body ?? "",
    author: pull.user?.login ?? "ghost",
    status: prStatus(pull),
    baseBranch: pull.base.ref,
    headBranch: pull.head.ref,
    headSha: pull.head.sha,
    additions: pull.additions,
    deletions: pull.deletions,
    changedFiles: pull.changed_files,
    files: files.map((f) => ({
      path: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      ...(f.patch ? { patch: f.patch } : {}),
    })),
    checks,
    threads: toThreads(review, conversation),
    createdAt: pull.created_at,
    updatedAt: pull.updated_at,
    htmlUrl: pull.html_url,
    ...(mergeStateOf(pull) ? { mergeState: mergeStateOf(pull) } : {}),
  };
};

export const github = new Hono<AppEnv>()
  .get("/me/installations", async (c) => {
    if (c.get("session").demo) {
      const demo: InstallationList = { items: DEMO_INSTALLATIONS, installUrl: installUrl(c) };
      return c.json(demo);
    }
    const token = await userToken(c);
    const items: Installation[] = (await listInstallations(c, token)).flatMap((inst) =>
      inst.account
        ? [
            {
              id: String(inst.id),
              account: inst.account.login,
              accountType: inst.account.type === "Organization" ? ("Organization" as const) : ("User" as const),
              status: inst.suspended_at ? ("suspended" as const) : ("active" as const),
              manageUrl: inst.html_url,
            },
          ]
        : [],
    );
    const res: InstallationList = { items, installUrl: installUrl(c) };
    return c.json(res);
  })

  .get("/repos", async (c) => {
    if (c.get("session").demo) {
      const demo: RepoPage = { items: DEMO_REPOS, nextCursor: null };
      return c.json(demo);
    }
    const cursor = decodeCursor(c.req.query("cursor"));
    const token = await userToken(c);
    const deps = c.get("deps");
    const installations = (await listInstallations(c, token)).filter((inst) => !inst.suspended_at);
    const inst = installations[cursor.i];
    if (!inst) return c.json({ items: [], nextCursor: null } satisfies RepoPage);

    const page = await githubGet<{
      total_count: number;
      repositories: { id: number; full_name: string; private: boolean }[];
    }>(deps, token, `/user/installations/${inst.id}/repositories?per_page=${PAGE_SIZE}&page=${cursor.p}`);

    const ids = page.repositories.map((r) => String(r.id));
    const watch = new Map<string, boolean>();
    if (ids.length) {
      const rows = await requireBinding(c.env, "DB")
        .prepare(
          `SELECT repo_id, watching FROM repo_watch WHERE user_id = ? AND repo_id IN (${ids.map(() => "?").join(",")})`,
        )
        .bind(c.get("session").userId, ...ids)
        .all<{ repo_id: string; watching: number }>();
      for (const row of rows.results) watch.set(row.repo_id, row.watching === 1);
    }

    const next: RepoCursor | null =
      cursor.p * PAGE_SIZE < page.total_count
        ? { i: cursor.i, p: cursor.p + 1 }
        : cursor.i + 1 < installations.length
          ? { i: cursor.i + 1, p: 1 }
          : null;
    const res: RepoPage = {
      items: page.repositories.map((r) => ({
        id: String(r.id),
        fullName: r.full_name,
        private: r.private,
        watching: watch.get(String(r.id)) ?? true,
      })),
      nextCursor: next ? encodeCursor(next) : null,
    };
    return c.json(res);
  })

  .put("/repos/:id/watch", async (c) => {
    const id = c.req.param("id");
    if (!/^[1-9]\d{0,19}$/.test(id)) throw new ApiError("validation_failed", "The repository id is not valid.");
    const body = await parseBody(c, RepoWatchRequest);
    const token = await userToken(c);
    // Confirms the user can see this repository through MergeMate before storing anything for it.
    const repo = await githubGet<{ id: number; full_name: string }>(c.get("deps"), token, `/repositories/${id}`);
    await requireBinding(c.env, "DB")
      .prepare(
        `INSERT INTO repo_watch (user_id, repo_id, full_name, watching, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (user_id, repo_id) DO UPDATE SET full_name = excluded.full_name, watching = excluded.watching,
           updated_at = excluded.updated_at`,
      )
      .bind(c.get("session").userId, String(repo.id), repo.full_name, body.watching ? 1 : 0, c.get("deps").now().toISOString())
      .run();
    return c.json({ id: String(repo.id), fullName: repo.full_name, watching: body.watching });
  })

  .get("/prs/:owner/:repo/:number", async (c) => {
    const { owner, repo, number } = c.req.param();
    if (!NAME.test(owner) || !NAME.test(repo) || !/^[1-9]\d{0,9}$/.test(number)) {
      throw new ApiError("validation_failed", "The pull request reference is not valid.");
    }
    const fullName = `${owner}/${repo}`;
    if (c.get("session").demo) {
      const demo = DEMO_PRS.find((p) => p.repo === fullName && p.number === Number(number));
      if (!demo) throw new ApiError("not_found", "Not found.");
      return c.json(demo);
    }

    // The user's own token: GitHub enforces their access to this repository.
    const token = await userToken(c);
    return c.json(await fetchPrDetail(c.get("deps"), token, owner, repo, Number(number)));
  });
