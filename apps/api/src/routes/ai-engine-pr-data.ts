import type { PrDetail, TriageItem } from "@mergemate/contracts";
import { githubGet } from "../lib/github";
import { getAccessToken } from "../lib/github-tokens";
import type { SessionRecord } from "../lib/sessions";
import type { Deps, Env } from "../env";
import { fetchPrDetail } from "./github";
import { PrFileInput } from "./ai-engine-scan";

export interface PrData {
  title: string;
  description: string;
  headSha: string;
  files: PrFileInput[];
  authorIsBot: boolean;
  coAuthoredByBot: boolean;
  hasTests: boolean | null;
  checksFailing: boolean | null;
}

export interface PrRefParts {
  owner: string;
  repo: string;
  number: number;
}

export const prRefString = (ref: PrRefParts): string => `${ref.owner}/${ref.repo}#${ref.number}`;

/** PR data source. Demo sessions short-circuit in the routers; this only serves signed-in users. */
export type PrDataSource = (session: SessionRecord, ref: PrRefParts) => Promise<PrData | null>;

export interface GhCommit {
  author: { login: string } | null;
  commit: { message: string };
}

export const TEST_PATH = /(\b__tests__\b|\btests?\b|\bspec\b|\.test\.|\.spec\.)/i;
// Files that hold logic. A PR that changes none (docs, images, config) has no tests to expect.
export const CODE_PATH = /\.(?:[cm]?[jt]sx?|py|rb|go|rs|java|kt|kts|swift|m|mm|c|cc|cpp|h|hpp|cs|php|scala|sql|sh|ex|exs|dart|vue|svelte)$/i;
// Co-author trailers of known coding agents and bot accounts. Only these are attributed; nothing is guessed.
export const CO_AUTHOR_AGENT =
  /^co-authored-by:[^\n]*(?:\[bot\]|<noreply@anthropic\.com>|<cursoragent@cursor\.com>|<[^>]*copilot[^>]*@users\.noreply\.github\.com>)/im;
// GitHub's Copilot coding agent opens PRs as the "Copilot" account, without the [bot] suffix.
export const isBotLogin = (login: string): boolean => login.endsWith("[bot]") || login === "Copilot";

/** true: a check failed. false: every check finished and none failed. null: no checks, or some still running. */
export const checksOutcome = (checks: { state: string }[]): boolean | null => {
  if (checks.some((check) => check.state === "failure")) return true;
  if (checks.length === 0 || checks.some((check) => check.state === "queued" || check.state === "in_progress")) return null;
  return false;
};

/** Maps fetched PR detail onto the signals the AI pipeline needs. */
export const toPrData = (detail: PrDetail, commits: GhCommit[]): PrData => ({
  title: detail.title,
  description: detail.body,
  headSha: detail.headSha,
  files: detail.files.map((file) => ({
    path: file.path,
    patch: file.patch ?? "",
    additions: file.additions,
    deletions: file.deletions,
  })),
  authorIsBot: isBotLogin(detail.author),
  coAuthoredByBot: commits.some(
    (commit) => isBotLogin(commit.author?.login ?? "") || CO_AUTHOR_AGENT.test(commit.commit.message),
  ),
  hasTests: detail.files.some((file) => TEST_PATH.test(file.path))
    ? true
    : detail.files.some((file) => CODE_PATH.test(file.path)) ? false : null,
  checksFailing: checksOutcome(detail.checks),
});

/**
 * Real PR data with the user's own token, so GitHub enforces their access.
 * Returns null for demo sessions and unknown users.
 */
export const githubPrDataSource = (env: Env, deps: Deps): PrDataSource => async (session, ref) => {
  const userId = session.userId;
  if (session.demo || !userId) return null;
  const token = await getAccessToken(env, userId, deps.now());
  const detail = await fetchPrDetail(deps, token, ref.owner, ref.repo, ref.number);
  const commits = await githubGet<GhCommit[]>(
    deps,
    token,
    `/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}/commits?per_page=100`,
  );
  return toPrData(detail, commits);
};

export const FIXTURE_PR: PrData = {
  title: "Add retry to flaky sync",
  description: "Retries the nightly sync up to 3 times.",
  headSha: "fixture",
  files: [
    {
      path: "src/sync.ts",
      patch: "@@ -1,3 +1,4 @@\n run();\n+retry(run, 3);",
      additions: 1,
      deletions: 0,
    },
  ],
  authorIsBot: false,
  coAuthoredByBot: false,
  hasTests: true,
  checksFailing: false,
};

export const FIXTURE_SUMMARY = {
  whatChanged: "Adds a 3-attempt retry around the nightly sync.",
  whyItMatters: "Stops the sync from failing on transient errors.",
  suggestedFocus: ["src/sync.ts"],
  coverage: { analyzedFiles: 1, skippedFiles: 0, truncatedFiles: 0 },
};

export const FIXTURE_PLAN = {
  readingOrder: [
    { file: "src/sync.ts", why: "The retry loop is the whole change; check the attempt count and the delay." },
    { file: "test/sync.test.ts", why: "Confirms the failure path is covered." },
  ],
  verify: ["The retry stops after 3 attempts.", "A permanent error is not retried forever.", "The test fails without the change."],
  draftComment: "Thanks for the retry. Could you confirm a permanent error stops after the third attempt and is logged once? Otherwise this looks good to me.",
  coverage: { analyzedFiles: 1, skippedFiles: 0, truncatedFiles: 0 },
  model: "sample:demo",
};

export const FIXTURE_ANSWER = {
  answer: "The change wraps the nightly sync in a loop of 3 attempts, so a transient error no longer fails the whole run.",
  citations: [{ file: "src/sync.ts" }],
  coverage: { analyzedFiles: 1, skippedFiles: 0, truncatedFiles: 0 },
  model: "sample:demo",
};

export const FIXTURE_RISK = {
  level: "low",
  reasons: ["No risk signals: small change with tests and passing checks."],
  coverage: { analyzedFiles: 1, skippedFiles: 0, truncatedFiles: 0 },
  secretFindings: [],
  quality: { needsCloserLook: false, reasons: [] as string[] },
  assessedBy: "rules_and_ai",
};

export const FIXTURE_TRIAGE: TriageItem[] = [
  { prRef: "octo/demo#7", lane: "needs_you", reason: "Review requested on a payments change." },
  { prRef: "octo/demo#9", lane: "fyi", reason: "No action needed." },
];
