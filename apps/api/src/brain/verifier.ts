/**
 * Merge verifier for brain cards.
 *
 * When GitHub reports a merged pull request, every card linked to that PR is
 * checked. Each check compares what was validated with what actually landed:
 * - head: GitHub's merged head equals the head recorded on the card;
 * - tree: the merge commit's tree equals that head's tree, so nothing else
 *   rode along;
 * - scope: the PR came from the card's branch, when the card names one;
 * - gates: the PR body names the exact head and a green `npm run check`.
 * The verifier records one PASS or FAIL event on the card and marks the card
 * merged. It is read-only on GitHub, behind the brain flag, and idempotent
 * per delivery.
 */
import { z } from "zod";
import type { Deps, Env } from "../env";
import { readBoundedBody } from "../lib/bounded-body";
import { refreshUserRepoAccess } from "../lib/repo-access";
import type { MergeRef } from "../lib/github-webhooks";
import { mintJobToken, revokeJobToken } from "../workflows/github-app-token";
import { brainEnabled } from "./flag";
import { db } from "./store";

const API = "https://api.github.com";
const SHA = /^[0-9a-f]{40}$/;
/** PR bodies are read only to look for the gate line; larger bodies are cut, not stored. */
const MAX_BODY_CHARS = 65536;

export interface MergedPull {
  merged: boolean;
  mergeCommitSha: string | null;
  headSha: string;
  headRef: string;
  body: string;
}

/** The two GitHub reads the verifier needs. Tests pass a fake. */
export interface VerifierGitHub {
  pull(repo: string, number: number): Promise<MergedPull>;
  commitTree(repo: string, sha: string): Promise<string>;
  done(): Promise<void>;
}

export interface VerifiedCard {
  head: string | null;
  branch: string | null;
}

/** Runs the four checks. Returns the reasons it fails; an empty list is a PASS. */
export function verifyMerge(card: VerifiedCard, pull: MergedPull, trees: { head: string; merge: string } | null): string[] {
  const problems: string[] = [];
  if (!pull.merged || !pull.mergeCommitSha) problems.push("GitHub does not report this PR as merged.");
  if (!card.head) problems.push("The card has no validated head (link the PR with its head first).");
  else if (card.head !== pull.headSha) problems.push(`Merged head ${pull.headSha.slice(0, 12)} is not the validated head ${card.head.slice(0, 12)}.`);
  if (!trees) problems.push("The merge and head trees could not be compared.");
  else if (trees.head !== trees.merge) problems.push("The merged tree differs from the validated head's tree.");
  if (card.branch && card.branch !== pull.headRef) problems.push(`The PR came from ${pull.headRef}, not the card's branch ${card.branch}.`);
  const body = pull.body.slice(0, MAX_BODY_CHARS);
  if (!body.includes(pull.headSha)) problems.push("The PR body does not name the exact head SHA.");
  // "`npm run check`: exit 0", optionally with a short parenthesis such as "(typecheck, lint, tests)".
  if (!/npm run check`?\s*(?:\([^)\n]{0,80}\))?\s*:?\s*exit (?:code )?0\b/i.test(body)) problems.push("The PR body does not record `npm run check` exit 0.");
  return problems;
}

const PullSchema = z.object({
  merged: z.boolean(),
  merge_commit_sha: z.string().regex(SHA).nullable(),
  head: z.object({ sha: z.string().regex(SHA), ref: z.string().min(1).max(255) }).passthrough(),
  body: z.string().nullable(),
}).passthrough();
const CommitSchema = z.object({ tree: z.object({ sha: z.string().regex(SHA) }).passthrough() }).passthrough();

/** Read-only GitHub access through a short-lived installation token for this one repository. */
export async function appGitHub(env: Env, deps: Deps, repo: string, repoId: number): Promise<VerifierGitHub> {
  const { token } = await mintJobToken(env, deps, repo.toLowerCase(), repoId, false);
  const get = async <T>(path: string, schema: z.ZodType<T>): Promise<T> => {
    const response = await deps.fetch(new URL(path, API), {
      redirect: "error",
      headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token}`, "x-github-api-version": "2022-11-28", "user-agent": "MergeMate-Brain-Verifier" },
    });
    if (!response.ok) { await response.body?.cancel().catch(() => undefined); throw new Error(`GitHub answered ${response.status}.`); }
    const parsed = schema.safeParse(JSON.parse(new TextDecoder().decode(await readBoundedBody(response, 1048576))) as unknown);
    if (!parsed.success) throw new Error("GitHub returned an unexpected shape.");
    return parsed.data;
  };
  return {
    pull: async (name, number) => {
      const pull = await get(`/repos/${name}/pulls/${number}`, PullSchema);
      return { merged: pull.merged, mergeCommitSha: pull.merge_commit_sha, headSha: pull.head.sha, headRef: pull.head.ref, body: (pull.body ?? "").slice(0, MAX_BODY_CHARS) };
    },
    commitTree: async (name, sha) => (await get(`/repos/${name}/git/commits/${sha}`, CommitSchema)).tree.sha,
    done: async () => { await revokeJobToken(deps, token); },
  };
}

interface LinkedCard { id: string; project_id: string; user_id: string; head: string | null; branch: string | null }

const eventId = async (deliveryId: string, cardId: string) => {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${deliveryId}\n${cardId}`)));
  return "v-" + Array.from(digest.slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
};

/**
 * Verifies a merged PR against every brain card linked to it. Does nothing while the brain flag is off
 * or when no card is linked, so ordinary merges cost no GitHub calls.
 */
export async function verifyMergedPullRequest(
  env: Env,
  deps: Deps,
  input: { deliveryId: string; repo: string; number: number; merge: MergeRef },
  github: (repo: string, repoId: number) => Promise<VerifierGitHub> = (repo, repoId) => appGitHub(env, deps, repo, repoId),
): Promise<void> {
  if (!input.number || !(await brainEnabled(env))) return;
  const [owner, name] = input.repo.split("/");
  if (!owner || !name) return;
  const linked = await db(env).prepare(
    // Only boards whose owner can read this repository through MergeMate: anyone can name a repo on a board,
    // but the verifier reads GitHub with the App's token, so a board for a repo its owner cannot see gets nothing.
    `SELECT c.id,c.project_id,p.user_id,c.head,c.branch FROM brain_cards c JOIN brain_projects p ON p.id=c.project_id
     JOIN users u ON u.id=p.user_id AND u.status='active'
     JOIN user_repo_access a ON a.user_id=p.user_id AND a.full_name=? COLLATE NOCASE
     WHERE lower(p.owner)=lower(?) AND lower(p.repo)=lower(?) AND c.pr_number=? ORDER BY c.updated_at DESC LIMIT 50`,
  ).bind(input.repo, owner, name, input.number).all<LinkedCard>();
  // The access list is a cache, so re-check each owner with GitHub first, as push delivery does.
  // A failed check fails closed: stale rows never let a board see a repository its owner lost.
  const allowed = new Set<string>();
  for (const userId of new Set((linked.results ?? []).map((card) => card.user_id))) {
    try {
      await refreshUserRepoAccess(env, deps, userId);
      if (await db(env).prepare("SELECT 1 FROM user_repo_access WHERE user_id=? AND full_name=? COLLATE NOCASE").bind(userId, input.repo).first()) allowed.add(userId);
    } catch { /* skip this owner */ }
  }
  const cards = (linked.results ?? []).filter((card) => allowed.has(card.user_id));
  if (!cards.length) return;

  let pull: MergedPull | null = null, trees: { head: string; merge: string } | null = null, failure: string | null = null;
  let client: VerifierGitHub | null = null;
  try {
    client = await github(input.repo, input.merge.repoId);
    pull = await client.pull(input.repo, input.number);
    if (pull.mergeCommitSha) trees = { head: await client.commitTree(input.repo, pull.headSha), merge: await client.commitTree(input.repo, pull.mergeCommitSha) };
  } catch {
    failure = "The verifier could not read this PR from GitHub.";
  } finally {
    await client?.done().catch(() => undefined);
  }

  const now = deps.now().toISOString(), d = db(env);
  const writes = await Promise.all(cards.map(async (card) => {
    const problems = failure || !pull ? [failure ?? "The verifier could not read this PR from GitHub."] : verifyMerge(card, pull, trees);
    const text = (problems.length ? `FAIL: PR #${input.number} merged as ${input.merge.mergeCommitSha.slice(0, 12)}. ${problems.join(" ")}` : `PASS: PR #${input.number} merged as ${input.merge.mergeCommitSha.slice(0, 12)} is the validated head ${pull?.headSha.slice(0, 12)} with the same tree, from the card's branch, with gates in the body.`).slice(0, 4096);
    const id = await eventId(input.deliveryId, card.id);
    return [
      d.prepare("INSERT INTO brain_events(id,project_id,card_id,kind,actor,text,at) VALUES(?,?,?,'verified','verifier',?,?) ON CONFLICT(id) DO NOTHING").bind(id, card.project_id, card.id, text, now),
      d.prepare("UPDATE brain_cards SET status='merged',updated_at=? WHERE id=? AND project_id=? AND status<>'merged'").bind(now, card.id, card.project_id),
    ];
  }));
  await d.batch(writes.flat());
}
