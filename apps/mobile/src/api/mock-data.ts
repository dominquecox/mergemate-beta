import type {
  BillingPlan,
  Notification,
  OrgInstallation,
  PrDetail,
  PublicPost,
  Repo,
  Session,
  TriageItem,
  User,
  UserSettings,
} from "../types";

/** Fresh demo data per client instance, so one client never sees another one's changes. */
export function seedUser(): User {
  return {
    id: "user_demo_1",
    login: "dominquecox",
    name: "Alex Rivera",
    avatarUrl: "https://avatars.githubusercontent.com/u/92395929?v=4",
  };
}

export function seedSession(): Session {
  return {
    token: "mm_demo_token_valid",
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    demo: true,
  };
}

export function seedRepos(): Repo[] {
  return [
    { id: "repo_1", fullName: "dominquecox/mergemate", private: true, watching: true },
    { id: "repo_2", fullName: "ploonu-llc/typepress", private: true, watching: true },
    { id: "repo_3", fullName: "dominquecox/vidiloopapi", private: false, watching: false },
    { id: "repo_4", fullName: "ploonu-llc/mariahlabs", private: true, watching: true },
  ];
}

export function seedOrgs(): OrgInstallation[] {
  return [
    {
      id: "org_1",
      org: "ploonu-llc",
      avatarUrl: "https://avatars.githubusercontent.com/u/92395929?v=4",
      status: "active",
    },
    {
      id: "org_2",
      org: "acme-corp",
      avatarUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100&auto=format&fit=crop&q=60",
      status: "pending_approval",
    },
    {
      id: "org_3",
      org: "security-team",
      avatarUrl: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=100&auto=format&fit=crop&q=60",
      status: "sso_required",
      ssoUrl: "https://github.com/orgs/security-team/sso",
    },
    {
      id: "org_4",
      org: "corp-firewall",
      avatarUrl: "https://images.unsplash.com/photo-1563986768609-322da13575f3?w=100&auto=format&fit=crop&q=60",
      status: "ip_blocked",
    },
  ];
}

export function seedNotifications(): Notification[] {
  return [
    {
      id: "notif_1",
      kind: "review",
      repo: "dominquecox/mergemate",
      number: 7,
      title: "API: Worker scaffold, contracts, provider adapter (#7)",
      author: "claude-bot",
      status: "open",
      risk: "low",
      summaryLine: "Hono Worker scaffold with typed request/response schemas and Meta Model API provider adapter.",
      updatedAt: new Date(Date.now() - 3600000).toISOString(),
      read: false,
    },
    {
      id: "notif_2",
      kind: "mine",
      repo: "dominquecox/mergemate",
      number: 8,
      title: "Tooling: require Node 22 (#8)",
      author: "dominquecox",
      status: "open",
      risk: "low",
      summaryLine: "Aligned root and package engines to Node >=22 for Wrangler compatibility.",
      updatedAt: new Date(Date.now() - 7200000).toISOString(),
      read: true,
    },
    {
      id: "notif_3",
      kind: "review",
      repo: "ploonu-llc/typepress",
      number: 412,
      title: "Database migration without rollback & auth middleware change (#412)",
      author: "external-contributor",
      status: "open",
      risk: "high",
      summaryLine: "Touches auth middleware and includes database migration without rollback; possible secret leak detected.",
      updatedAt: new Date(Date.now() - 14400000).toISOString(),
      read: false,
    },
    {
      id: "notif_4",
      kind: "mention",
      repo: "dominquecox/vidiloopapi",
      number: 108,
      title: "Worker AI inference rate limiter (#108)",
      author: "agy-agent",
      status: "open",
      risk: "medium",
      summaryLine: "Adds per-session sliding window rate limiter before AI dispatch.",
      updatedAt: new Date(Date.now() - 86400000).toISOString(),
      read: true,
    },
    {
      id: "notif_5",
      kind: "review",
      repo: "ploonu-llc/mariahlabs",
      number: 57,
      title: "Stripe webhook retry handler (#57)",
      author: "jules-agent",
      status: "open",
      risk: "medium",
      summaryLine: "Retries failed Stripe webhooks with backoff; one test fails and the handler skips signature checks on retry.",
      updatedAt: new Date(Date.now() - 5400000).toISOString(),
      read: false,
    },
    {
      id: "notif_6",
      kind: "mine",
      repo: "ploonu-llc/typepress",
      number: 398,
      title: "Upgrade editor toolbar to the new ProseMirror plugin API (#398)",
      author: "dominquecox",
      status: "open",
      risk: "low",
      summaryLine: "Swaps the toolbar plugin for the maintained API; behaviour unchanged and all checks pass.",
      updatedAt: new Date(Date.now() - 10800000).toISOString(),
      read: true,
    },
  ];
}

const AVATAR = "https://avatars.githubusercontent.com/u/92395929?v=4";

interface DemoDetailInput {
  owner: string;
  repo: string;
  number: number;
  title: string;
  author: string;
  headBranch: string;
  baseBranch: string;
  hoursAgo: number;
  checks: Array<[name: string, conclusion: "success" | "failure"]>;
  files: Array<[filename: string, status: "added" | "modified", additions: number, deletions: number]>;
  comment?: { author: string; body: string };
  summary: { whatChanged: string; whyItMatters: string; suggestedFocus: string[] };
  risk: { level: "low" | "medium" | "high"; reasons: string[]; closerLook?: string[] };
}

/** Builds one demo pull request detail; totals are derived from the file list so they always agree. */
function demoDetail(i: DemoDetailInput): PrDetail {
  const additions = i.files.reduce((n, f) => n + f[2], 0);
  const deletions = i.files.reduce((n, f) => n + f[3], 0);
  const coverage = { analyzedFiles: i.files.length, skippedFiles: 0, truncatedFiles: 0 };
  const at = (hours: number) => new Date(Date.now() - hours * 3600000).toISOString();
  return {
    owner: i.owner,
    repo: i.repo,
    number: i.number,
    title: i.title,
    author: i.author,
    authorAvatar: AVATAR,
    status: "open",
    headBranch: i.headBranch,
    baseBranch: i.baseBranch,
    createdAt: at(i.hoursAgo + 2),
    updatedAt: at(i.hoursAgo),
    additions,
    deletions,
    changedFilesCount: i.files.length,
    htmlUrl: `https://github.com/${i.owner}/${i.repo}/pull/${i.number}`,
    checks: i.checks.map(([name, conclusion], n) => ({ id: `c${n + 1}`, name, status: "completed", conclusion })),
    files: i.files.map(([filename, status, a, d]) => ({ filename, status, additions: a, deletions: d })),
    comments: i.comment
      ? [{ id: `com_${i.number}`, author: i.comment.author, avatarUrl: AVATAR, body: i.comment.body, createdAt: at(i.hoursAgo / 2) }]
      : [],
    summary: { ...i.summary, coverage },
    risk: {
      level: i.risk.level,
      reasons: i.risk.reasons,
      coverage,
      ...(i.risk.closerLook ? { quality: { needsCloserLook: true, reasons: i.risk.closerLook } } : {}),
    },
  };
}

export function seedPrDetails(): Record<string, PrDetail> {
  return {
    ...seedHeroPrDetails(),
    "dominquecox/mergemate/8": demoDetail({
      owner: "dominquecox", repo: "mergemate", number: 8, title: "Tooling: require Node 22",
      author: "dominquecox", headBranch: "chore/node-22", baseBranch: "development", hoursAgo: 2,
      checks: [["typecheck", "success"], ["lint", "success"], ["vitest", "success"]],
      files: [["package.json", "modified", 2, 2], ["apps/api/package.json", "modified", 1, 1], [".nvmrc", "added", 1, 0]],
      summary: {
        whatChanged: "Raises the Node engine range to 22 or newer in the root and API packages and pins it in .nvmrc.",
        whyItMatters: "Wrangler needs Node 22, so local builds and CI now agree with what the Worker is deployed with.",
        suggestedFocus: ["package.json"],
      },
      risk: { level: "low", reasons: ["Three small config files", "All checks pass"] },
    }),
    "dominquecox/vidiloopapi/108": demoDetail({
      owner: "dominquecox", repo: "vidiloopapi", number: 108, title: "Worker AI inference rate limiter",
      author: "agy-agent", headBranch: "feat/ai-rate-limit", baseBranch: "main", hoursAgo: 24,
      checks: [["typecheck", "success"], ["lint", "success"], ["vitest (18 tests)", "success"]],
      files: [
        ["src/ai/rate-limit.ts", "added", 94, 0],
        ["src/ai/dispatch.ts", "modified", 11, 3],
        ["test/rate-limit.test.ts", "added", 120, 0],
      ],
      comment: { author: "dominquecox", body: "Should the window be per session or per user? @agy-agent" },
      summary: {
        whatChanged: "Adds a per-session sliding-window limiter that runs before every AI dispatch and returns a clear retry-after.",
        whyItMatters: "Caps model spend per session, so one runaway client cannot burn the shared AI budget.",
        suggestedFocus: ["src/ai/rate-limit.ts", "src/ai/dispatch.ts"],
      },
      risk: {
        level: "medium",
        reasons: ["New code sits in front of every AI call", "Limit values are hard-coded, not configurable"],
      },
    }),
    "ploonu-llc/mariahlabs/57": demoDetail({
      owner: "ploonu-llc", repo: "mariahlabs", number: 57, title: "Stripe webhook retry handler",
      author: "jules-agent", headBranch: "feat/webhook-retry", baseBranch: "main", hoursAgo: 1.5,
      checks: [["typecheck", "success"], ["lint", "success"], ["vitest", "failure"]],
      files: [
        ["src/billing/webhook-retry.ts", "added", 76, 0],
        ["src/billing/webhook.ts", "modified", 14, 9],
        ["test/webhook-retry.test.ts", "added", 58, 0],
      ],
      comment: { author: "dominquecox", body: "The retry path calls the handler directly. Does it still verify the Stripe signature?" },
      summary: {
        whatChanged: "Retries failed Stripe webhook deliveries with exponential backoff and stores the attempt count.",
        whyItMatters: "Missed webhooks mean customers pay but never get access, so retries matter, but only if they stay verified.",
        suggestedFocus: ["src/billing/webhook-retry.ts", "src/billing/webhook.ts"],
      },
      risk: {
        level: "medium",
        reasons: ["Touches billing webhook handling", "One test is failing"],
        closerLook: ["The retry path skips signature verification.", "The failing test covers the changed code."],
      },
    }),
    "ploonu-llc/typepress/398": demoDetail({
      owner: "ploonu-llc", repo: "typepress", number: 398, title: "Upgrade editor toolbar to the new ProseMirror plugin API",
      author: "dominquecox", headBranch: "chore/toolbar-plugin", baseBranch: "main", hoursAgo: 3,
      checks: [["typecheck", "success"], ["lint", "success"], ["vitest (61 tests)", "success"]],
      files: [["src/editor/toolbar.ts", "modified", 28, 31], ["src/editor/plugins.ts", "modified", 6, 4]],
      summary: {
        whatChanged: "Replaces the deprecated toolbar plugin with the maintained ProseMirror API; menus and shortcuts stay the same.",
        whyItMatters: "The old plugin is no longer patched, so this removes a dependency that would block future editor upgrades.",
        suggestedFocus: ["src/editor/toolbar.ts"],
      },
      risk: { level: "low", reasons: ["Two files, behaviour unchanged", "All checks pass"] },
    }),
  };
}

function seedHeroPrDetails(): Record<string, PrDetail> {
  return {
    "dominquecox/mergemate/7": {
      owner: "dominquecox",
      repo: "mergemate",
      number: 7,
      title: "API: Worker scaffold, contracts, provider adapter",
      author: "claude-bot",
      authorAvatar: "https://avatars.githubusercontent.com/u/92395929?v=4",
      status: "open",
      headBranch: "claude/gallant-ritchie-gvljxr",
      baseBranch: "development",
      createdAt: new Date(Date.now() - 7200000).toISOString(),
      updatedAt: new Date(Date.now() - 3600000).toISOString(),
      additions: 4988,
      deletions: 33,
      changedFilesCount: 32,
      htmlUrl: "https://github.com/dominquecox/mergemate/pull/7",
      checks: [
        { id: "c1", name: "typecheck", status: "completed", conclusion: "success" },
        { id: "c2", name: "lint", status: "completed", conclusion: "success" },
        { id: "c3", name: "vitest (32 tests)", status: "completed", conclusion: "success" },
        { id: "c4", name: "secret-scan (gitleaks)", status: "completed", conclusion: "success" },
      ],
      files: [
        { filename: "apps/api/src/app.ts", status: "added", additions: 50, deletions: 0 },
        { filename: "apps/api/src/ai/provider.ts", status: "added", additions: 106, deletions: 0 },
        { filename: "packages/contracts/src/index.ts", status: "added", additions: 4, deletions: 0 },
        { filename: "package-lock.json", status: "modified", additions: 4015, deletions: 0 },
      ],
      comments: [
        {
          id: "com_1",
          author: "dominquecox",
          avatarUrl: "https://avatars.githubusercontent.com/u/92395929?v=4",
          body: "Scaffold verified on Node 22 with green gate exit codes.",
          createdAt: new Date(Date.now() - 1800000).toISOString(),
        },
      ],
      summary: {
        whatChanged: "Hono Worker scaffold with request IDs, rate limiting, and typed contracts for session and PR triage.",
        whyItMatters: "Establishes the server-side backend boundary and contracts before clients connect.",
        suggestedFocus: ["apps/api/src/ai/provider.ts", "packages/contracts/src/ai.ts"],
        coverage: { analyzedFiles: 32, skippedFiles: 0, truncatedFiles: 0 },
      },
      risk: {
        level: "low",
        reasons: ["Zero external network requests in tests", "No secret keys committed; all environment values read from Worker secrets"],
        coverage: { analyzedFiles: 32, skippedFiles: 0, truncatedFiles: 0 },
      },
    },
    "ploonu-llc/typepress/412": {
      owner: "ploonu-llc",
      repo: "typepress",
      number: 412,
      title: "Database migration without rollback & auth middleware change",
      author: "external-contributor",
      authorAvatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=60",
      status: "open",
      headBranch: "feature/billing-stripe-key",
      baseBranch: "main",
      createdAt: new Date(Date.now() - 14400000).toISOString(),
      updatedAt: new Date(Date.now() - 7200000).toISOString(),
      additions: 124,
      deletions: 18,
      changedFilesCount: 4,
      htmlUrl: "https://github.com/ploonu-llc/typepress/pull/412",
      checks: [
        { id: "c1", name: "typecheck", status: "completed", conclusion: "success" },
        { id: "c2", name: "lint", status: "completed", conclusion: "failure" },
      ],
      files: [
        { filename: "config/stripe.ts", status: "modified", additions: 12, deletions: 1 },
        { filename: "migrations/0042_users.sql", status: "added", additions: 80, deletions: 0 },
        { filename: "src/middleware/auth.ts", status: "modified", additions: 32, deletions: 17 },
      ],
      comments: [
        {
          id: "com_2",
          author: "security-auditor",
          avatarUrl: "https://avatars.githubusercontent.com/u/92395929?v=4",
          body: "Warning: Please remove raw test credentials from configuration file.",
          createdAt: new Date(Date.now() - 3600000).toISOString(),
        },
      ],
      summary: {
        whatChanged: "Modifies authentication middleware session verification and adds schema migration for billing profiles.",
        whyItMatters: "Changes core authentication path and database structure across all tenants.",
        suggestedFocus: ["config/stripe.ts (secret leak)", "migrations/0042_users.sql (missing down migration)"],
        coverage: { analyzedFiles: 4, skippedFiles: 0, truncatedFiles: 0 },
      },
      risk: {
        level: "high",
        reasons: [
          "Possible secret pattern detected in config/stripe.ts:12",
          "Database migration lacks a reversible rollback step",
          "Modifies core auth middleware",
        ],
        coverage: { analyzedFiles: 4, skippedFiles: 0, truncatedFiles: 0 },
        secretFindings: [{ file: "config/stripe.ts", line: 12, rule: "credential-assignment" }],
        quality: { needsCloserLook: true, reasons: ["No tests for the changed logic."] },
        assessedBy: "rules_and_ai",
      },
      secretWarning: {
        file: "config/stripe.ts",
        line: 12,
        maskedSnippet: 'const STRIPE_SECRET = "sk_live_••••••••••••••••••••••••";',
        rule: "stripe-api-key",
      },
    },
  };
}

export function seedTriageQueue(): TriageItem[] {
  return [
    {
      prRef: "dominquecox/mergemate#7",
      lane: "needs_you",
      reason: "Requested your review on the API scaffold and contracts.",
    },
    {
      prRef: "ploonu-llc/typepress#412",
      lane: "needs_you",
      reason: "High risk: potential credential leak in config and auth modifications.",
    },
    {
      prRef: "dominquecox/vidiloopapi#108",
      lane: "fyi",
      reason: "Mentioned you regarding Workers AI rate limiting policy.",
    },
    {
      prRef: "dominquecox/mergemate#8",
      lane: "ignore",
      reason: "Your own tooling PR; checks already passing.",
    },
    {
      prRef: "ploonu-llc/mariahlabs#57",
      lane: "needs_you",
      reason: "Billing webhook change with a failing test and no signature check on retries.",
    },
    {
      prRef: "ploonu-llc/typepress#398",
      lane: "ignore",
      reason: "Your own low-risk toolbar upgrade; all checks pass.",
    },
  ];
}

export function seedSettings(): UserSettings {
  return {
    notifications: { review: true, mention: true, mine: true },
    quietHours: { start: "22:00", end: "08:00", timeZone: "UTC" },
    aiSummaries: true,
  };
}

export function seedBilling(): BillingPlan {
  return {
    plan: "free",
    status: "none",
    trialEligible: true,
    canManage: false,
  };
}

export function seedPublicPosts(): PublicPost[] {
  return [
    {
      slug: "launch-ready",
      type: "news",
      title: "MergeMate Enters the Meta Global AI Hackathon",
      date: "2026-10-26",
      summary: "Introducing MergeMate: calm, fast, intelligent GitHub PR companion built with Meta AI models.",
      content: "MergeMate brings intelligent pull request triage, risk scoring, and image insights to mobile and web.",
    },
    {
      slug: "v0-1-release",
      type: "changelog",
      title: "v0.1.0: Foundation Release",
      date: "2026-10-26",
      summary: "First release with GitHub App authentication, PR detail view, and smart triage deck.",
      content: "Shipped the core iOS & web app with responsive layouts, offline resilience, and demo mode.",
    },
  ];
}
