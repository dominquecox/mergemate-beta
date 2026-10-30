import type { RiskLevel, SecretFinding, TriageLane } from "@mergemate/contracts";
import { PrData } from "./ai-engine-pr-data";
import { scanPatch } from "./ai-engine-scan";

export const SENSITIVE_PATHS = /(auth|login|session|password|payment|billing|stripe|migrat)/i;
export const levelRank: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2 };

export const maxLevel = (...levels: RiskLevel[]): RiskLevel =>
  levels.reduce((a, b) => (levelRank[a] >= levelRank[b] ? a : b));

export interface RiskSignalInput {
  files: string[];
  totalChanged: number;
  secretFindings: SecretFinding[];
  hasTests: boolean | null;
  checksFailing: boolean | null;
}

/** Deterministic risk signals. A high signal here can only raise the model level, never lower it. */
export const assessRiskSignals = (input: RiskSignalInput): { level: RiskLevel; reasons: string[] } => {
  const reasons: string[] = [];
  let level: RiskLevel = "low";
  const raise = (next: RiskLevel, reason: string): void => {
    level = maxLevel(level, next);
    reasons.push(reason);
  };
  if (input.secretFindings.length > 0) raise("high", "Possible secret in this PR (values masked).");
  if (input.checksFailing === true) raise("high", "Required checks are failing.");
  if (input.files.some((file) => SENSITIVE_PATHS.test(file))) {
    raise("medium", "Touches sensitive areas (auth, payments or migrations).");
  }
  if (input.hasTests === false) raise("medium", "No tests changed.");
  if (input.totalChanged > 1000) raise("medium", "Very large diff.");
  if (reasons.length === 0) {
    // Only claim what was seen: missing evidence is named, never reported as passing.
    reasons.push(
      input.checksFailing === null
        ? "No rule-based risk signals. Checks have not reported a result yet."
        : "No risk signals: small change with tests and passing checks.",
    );
  }
  return { level, reasons };
};

export interface QualitySignalInput {
  authorIsBot: boolean;
  coAuthoredByBot: boolean;
  hasTests: boolean | null;
  hasTodo: boolean;
  checksFailing: boolean | null;
  filesOutsideScope: boolean;
  totalChanged: number;
  /** 0..1 risk estimate from the fast classifier; null until the classifier is wired. */
  classifierScore: number | null;
}

/** Flags PRs that need a closer look, especially agent-authored ones. */
export const assessQuality = (input: QualitySignalInput): { needsCloserLook: boolean; reasons: string[] } => {
  const reasons: string[] = [];
  if (input.authorIsBot) reasons.push("Opened by a bot or app account.");
  if (input.coAuthoredByBot) reasons.push("Commits are co-authored by a coding agent.");
  if (input.hasTests === false) reasons.push("No tests for the changed logic.");
  if (input.hasTodo) reasons.push("Contains TODO or placeholder code.");
  if (input.checksFailing === true) reasons.push("Checks are failing.");
  if (input.filesOutsideScope) reasons.push("Files outside the stated scope.");
  if (input.totalChanged > 1500) reasons.push("Very large diff.");
  if (input.classifierScore !== null && input.classifierScore >= 0.7) {
    reasons.push("Fast classifier flagged this PR.");
  }
  return { needsCloserLook: reasons.length > 0, reasons };
};

export const scoreTriageLane = (quality: {
  needsCloserLook: boolean;
  reasons: string[];
}): { lane: TriageLane; reason: string } =>
  quality.needsCloserLook
    ? {
        lane: "needs_you",
        reason: `Needs a closer look: ${quality.reasons[0]}${quality.reasons.length > 1 ? ` (+${quality.reasons.length - 1} more)` : ""}`,
      }
    : { lane: "fyi", reason: "No risk signals." };

export const TODO_PATTERN = /\b(TODO|FIXME|XXX)\b/;

export const containsTodo = (patch: string): boolean => TODO_PATTERN.test(patch);



export interface CommonSignals {
  files: string[];
  totalChanged: number;
  secretFindings: SecretFinding[];
}

export const commonSignals = (data: PrData): CommonSignals & { qualityInput: QualitySignalInput } => {
  const secretFindings = data.files.flatMap((file) => scanPatch(file.path, file.patch));
  const totalChanged = data.files.reduce(
    (sum, file) => sum + (file.additions ?? 0) + (file.deletions ?? 0),
    0,
  );
  return {
    files: data.files.map((file) => file.path),
    totalChanged,
    secretFindings,
    qualityInput: {
      authorIsBot: data.authorIsBot,
      coAuthoredByBot: data.coAuthoredByBot,
      hasTests: data.hasTests,
      hasTodo: data.files.some((file) => containsTodo(file.patch)),
      checksFailing: data.checksFailing,
      filesOutsideScope: false,
      totalChanged,
      classifierScore: null,
    },
  };
};

/** Full summary pipeline for signed-in users. Demo sessions use fixtures and never reach here. */
