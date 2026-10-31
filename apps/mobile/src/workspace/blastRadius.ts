import type { PrFile } from "../types";

export type BlastDomainId =
  | "auth"
  | "database"
  | "billing"
  | "api"
  | "security"
  | "dependencies"
  | "ui";

export interface BlastDomain {
  id: BlastDomainId;
  label: string;
  icon:
    | "key-outline"
    | "server-outline"
    | "card-outline"
    | "git-network-outline"
    | "lock-closed-outline"
    | "cube-outline"
    | "phone-portrait-outline";
  files: string[];
  severity: "high" | "medium" | "low";
  summary: string;
}

const TEST_PATHS = /(^|\/)(__tests__|tests?|spec)(\/|$)|\.(test|spec)\.[a-z]+$/i;

interface DomainRule {
  id: BlastDomainId;
  label: string;
  icon: BlastDomain["icon"];
  pattern: RegExp;
  severity: "high" | "medium" | "low";
  describe: (count: number) => string;
}

const DOMAIN_RULES: readonly DomainRule[] = [
  {
    id: "auth",
    label: "Auth & Identity",
    icon: "key-outline",
    pattern: /(auth|session|token|login|oauth|permission|role|cookie|credential)/i,
    severity: "high",
    describe: (count) => `${count} file${count === 1 ? "" : "s"} affecting authentication, sessions, or permissions.`,
  },
  {
    id: "database",
    label: "Database & Schema",
    icon: "server-outline",
    pattern: /(migration|schema|d1|sql|db|sqlite|entity)/i,
    severity: "high",
    describe: (count) => `${count} database or migration file${count === 1 ? "" : "s"} with schema changes.`,
  },
  {
    id: "billing",
    label: "Billing & Stripe",
    icon: "card-outline",
    pattern: /(stripe|billing|payment|subscription|plan|checkout|invoice)/i,
    severity: "high",
    describe: (count) => `${count} file${count === 1 ? "" : "s"} touching payment processing or subscriptions.`,
  },
  {
    id: "security",
    label: "Security & Config",
    icon: "lock-closed-outline",
    pattern: /(secrets?|\.env|config|cors|headers|csp|gitleaks|firewall|guard)/i,
    severity: "high",
    describe: (count) => `${count} security or configuration file${count === 1 ? "" : "s"} modified.`,
  },
  {
    id: "dependencies",
    label: "Dependencies & Build",
    icon: "cube-outline",
    pattern: /(package\.json|package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Podfile|build\.gradle|wrangler\.jsonc?|wrangler\.toml)/i,
    severity: "medium",
    describe: (count) => `${count} dependency or package manifest${count === 1 ? "" : "s"} changed.`,
  },
  {
    id: "api",
    label: "API & Webhooks",
    icon: "git-network-outline",
    pattern: /(webhook|proxy|endpoint|fetch|router|routes|api)/i,
    severity: "medium",
    describe: (count) => `${count} network or API endpoint file${count === 1 ? "" : "s"} affected.`,
  },
  {
    id: "ui",
    label: "UI & Layout",
    icon: "phone-portrait-outline",
    pattern: /\.(tsx|jsx|css|scss|html)$|src\/(components|views|screens|theme)\//i,
    severity: "low",
    describe: (count) => `${count} client interface component${count === 1 ? "" : "s"} updated.`,
  },
];

/**
 * Analyzes the changed files in a PR and groups them into architectural blast-radius domains.
 * Prioritizes high-risk blast areas (auth, migrations, payments, security) over general UI.
 */
export function detectBlastRadius(files: readonly PrFile[]): BlastDomain[] {
  if (!files || files.length === 0) return [];

  const domains: BlastDomain[] = [];

  for (const rule of DOMAIN_RULES) {
    const matchingFiles: string[] = [];

    for (const file of files) {
      // For sensitive categories, ignore pure test files unless no production files matched
      if (rule.pattern.test(file.filename)) {
        matchingFiles.push(file.filename);
      }
    }

    if (matchingFiles.length > 0) {
      // Check if matches are exclusively tests
      const onlyTests = matchingFiles.every((f) => TEST_PATHS.test(f));
      const adjustedSeverity = onlyTests && rule.severity === "high" ? "medium" : rule.severity;

      domains.push({
        id: rule.id,
        label: rule.label,
        icon: rule.icon,
        files: matchingFiles,
        severity: adjustedSeverity,
        summary: rule.describe(matchingFiles.length),
      });
    }
  }

  // Sort domains: high severity first, then by matching file count descending
  const severityRank = { high: 0, medium: 1, low: 2 };
  return domains.sort((a, b) => {
    const rankDiff = severityRank[a.severity] - severityRank[b.severity];
    if (rankDiff !== 0) return rankDiff;
    return b.files.length - a.files.length;
  });
}
