import { z } from "zod";
import { PrRef, RiskLevel } from "./common";

/** How much of the pull request the model saw. */
export const AnalysisCoverage = z.object({
  analyzedFiles: z.number().int().nonnegative(),
  skippedFiles: z.number().int().nonnegative(),
  truncatedFiles: z.number().int().nonnegative(),
});
export type AnalysisCoverage = z.infer<typeof AnalysisCoverage>;

export const PrSummary = z.object({
  whatChanged: z.string(),
  whyItMatters: z.string(),
  suggestedFocus: z.array(z.string()),
  coverage: AnalysisCoverage,
});
export type PrSummary = z.infer<typeof PrSummary>;

export const PrRisk = z.object({
  level: RiskLevel,
  reasons: z.array(z.string()).min(1),
  coverage: AnalysisCoverage,
});
export type PrRisk = z.infer<typeof PrRisk>;

export const TriageLane = z.enum(["needs_you", "fyi", "ignore"]);
export type TriageLane = z.infer<typeof TriageLane>;

export const TriageItem = z.object({
  prRef: PrRef,
  lane: TriageLane,
  reason: z.string(),
});
export type TriageItem = z.infer<typeof TriageItem>;

export const TriageQueue = z.array(TriageItem);
export type TriageQueue = z.infer<typeof TriageQueue>;

export const TriageChoice = z.object({
  lane: TriageLane,
});
export type TriageChoice = z.infer<typeof TriageChoice>;
