import type {PrCheck, PrFile, PrRisk} from "../types";

// Mirrors the API's sensitive-area rule so the file we point at matches the reason Clef gave.
const SENSITIVE_PATHS = /(auth|login|session|password|payment|billing|stripe|migrat)/i;
const TEST_PATHS = /(^|\/)(__tests__|tests?|spec)(\/|$)|\.(test|spec)\.[a-z]+$/i;

export function fileRiskScore(file: PrFile): number {
  let score = file.additions + file.deletions;
  if (SENSITIVE_PATHS.test(file.filename)) score += 1000;
  if (TEST_PATHS.test(file.filename)) score -= 500;
  return score;
}

/** The loaded file most worth reading first, or null when no files are loaded. */
export function riskiestFile(files: readonly PrFile[]): PrFile | null {
  let best: PrFile | null = null;
  for (const file of files) if (!best || fileRiskScore(file) > fileRiskScore(best)) best = file;
  return best;
}

export interface RiskBanner {
  level: PrRisk["level"];
  text: string;
  file: string | null;
}

/** One line from the Clef score: the top reason plus the file to open first. Plain text only. */
export function riskBanner(risk: PrRisk | undefined, files: readonly PrFile[]): RiskBanner | null {
  if (!risk) return null;
  const first = risk.reasons[0]?.trim().replace(/[.\s]+$/, "") ?? "";
  const file = risk.level === "low" ? null : riskiestFile(files)?.filename ?? null;
  const text =
    risk.level === "low"
      ? `Low risk: ${first || "no risky signals found"}.`
      : `Why this is ${risk.level === "high" ? "high" : "medium"} risk: ${first}.`;
  return {level: risk.level, text, file};
}

export interface RiskEvidence {
  reason: string;
  /** A loaded file that backs this reason, or null when none can be named honestly. */
  file: string | null;
  /** A failing check that backs this reason. */
  check: string | null;
}

const TEST_WORDS = /\b(tests?|failing|failed|checks?|ci)\b/i;
const SENSITIVE_WORDS = /(auth|login|session|password|payment|billing|stripe|webhook|migrat|secret|sensitive)/i;

/**
 * Pairs each plain-English reason with the file or check that earned it. Matching is by keyword against what is
 * loaded: a reason with no clear match is shown without a link rather than pointing at a guess.
 */
export function riskEvidence(risk: PrRisk | undefined, files: readonly PrFile[], checks: readonly PrCheck[]): RiskEvidence[] {
  if (!risk) return [];
  const failing = checks.find((c) => c.conclusion === "failure") ?? null;
  return risk.reasons.map((reason) => {
    let file: string | null = null;
    let check: string | null = null;
    if (TEST_WORDS.test(reason) && failing) check = failing.name;
    if (SENSITIVE_WORDS.test(reason)) {
      const sensitive = files.filter((f) => SENSITIVE_PATHS.test(f.filename) && !TEST_PATHS.test(f.filename));
      file = riskiestFile(sensitive)?.filename ?? null;
    }
    return { reason, file, check };
  });
}
