import type { Installation, Notification, PrDetail, Repo, User } from "@mergemate/contracts";

// Seeded demo data. Fictional accounts and repositories; served to demo sessions only.

export const DEMO_USER: User = {
  id: "demo",
  login: "demo-reviewer",
  name: "Demo Reviewer",
  avatarUrl: "https://avatars.githubusercontent.com/u/0?v=4",
};

export const DEMO_INSTALLATIONS: Installation[] = [
  {
    id: "1",
    account: "acme-demo",
    accountType: "Organization",
    status: "active",
    manageUrl: "https://github.com/apps",
  },
];

export const DEMO_REPOS: Repo[] = [
  { id: "1001", fullName: "acme-demo/storefront", private: false, watching: true },
  { id: "1002", fullName: "acme-demo/payments-api", private: true, watching: true },
  { id: "1003", fullName: "acme-demo/docs", private: false, watching: false },
];

const at = (iso: string) => iso;

const pr = (
  repo: string,
  number: number,
  title: string,
  author: string,
  updatedAt: string,
  extra: Partial<PrDetail> = {},
): PrDetail => ({
  repo,
  number,
  title,
  body: "",
  author,
  status: "open",
  baseBranch: "main",
  headBranch: `feature/${number}`,
  headSha: number.toString(16).padStart(40, "a"),
  additions: 0,
  deletions: 0,
  changedFiles: 0,
  files: [],
  checks: [],
  threads: [],
  createdAt: updatedAt,
  updatedAt,
  htmlUrl: `https://github.com/${repo}/pull/${number}`,
  mergeState: "clean",
  ...extra,
});

export const DEMO_PRS: PrDetail[] = [
  pr("acme-demo/payments-api", 42, "Retry failed card charges with backoff", "rivera-dev", at("2026-10-26T15:20:00Z"), {
    body: "Adds exponential backoff for declined-but-retryable charges and a cap of three attempts.",
    mergeState: "conflicts",
    additions: 184,
    deletions: 22,
    changedFiles: 4,
    files: [
      { path: "src/charges/retry.ts", status: "added", additions: 120, deletions: 0 },
      { path: "src/charges/charge.ts", status: "modified", additions: 38, deletions: 18 },
      { path: "src/charges/retry.test.ts", status: "added", additions: 24, deletions: 0 },
      { path: "migrations/0007_charge_attempts.sql", status: "added", additions: 2, deletions: 4 },
    ],
    checks: [
      { name: "build", state: "success" },
      { name: "test", state: "failure" },
    ],
    threads: [
      {
        id: "t1",
        path: "src/charges/retry.ts",
        line: 31,
        comments: [
          { id: "c1", author: "lee-ops", body: "Should this be idempotent per charge id?", createdAt: "2026-10-26T14:02:00Z" },
        ],
      },
    ],
  }),
  pr("acme-demo/storefront", 318, "Lazy-load product images below the fold", "kim-frontend", at("2026-10-26T13:05:00Z"), {
    additions: 46,
    deletions: 12,
    changedFiles: 3,
    files: [
      { path: "assets/product-grid.png", status: "modified", additions: 0, deletions: 0 },
      { path: "components/ProductGrid.tsx", status: "modified", additions: 40, deletions: 10 },
      { path: "components/Image.tsx", status: "modified", additions: 6, deletions: 2 },
    ],
    checks: [{ name: "ci", state: "success" }],
  }),
  pr("acme-demo/storefront", 321, "Bump checkout SDK to 5.2", "dependabot[bot]", at("2026-10-26T09:40:00Z"), {
    additions: 3,
    deletions: 3,
    changedFiles: 2,
    files: [
      { path: "package.json", status: "modified", additions: 1, deletions: 1 },
      { path: "package-lock.json", status: "modified", additions: 2, deletions: 2 },
    ],
    checks: [{ name: "ci", state: "in_progress" }],
  }),
  pr("acme-demo/payments-api", 39, "Draft: split webhook handlers per event type", "demo-reviewer", at("2026-10-25T18:30:00Z"), {
    status: "draft",
    additions: 210,
    deletions: 160,
    changedFiles: 6,
  }),
];

export const demoNotificationId = (repo: string, number: number) => `demo.${repo.replace("/", ".")}.${number}`;

export const DEMO_NOTIFICATIONS: Notification[] = [
  { kind: "review" as const, pr: DEMO_PRS[0] },
  { kind: "mention" as const, pr: DEMO_PRS[1] },
  { kind: "review" as const, pr: DEMO_PRS[2] },
  { kind: "mine" as const, pr: DEMO_PRS[3] },
].flatMap(({ kind, pr }) =>
  pr
    ? [
        {
          id: demoNotificationId(pr.repo, pr.number),
          kind,
          repo: pr.repo,
          number: pr.number,
          title: pr.title,
          author: pr.author,
          status: pr.status,
          updatedAt: pr.updatedAt,
          read: false,
        },
      ]
    : [],
);
