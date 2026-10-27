import { z } from "zod";
import { IsoDateTime, PrRef, RiskLevel } from "./common";

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

/** A possible leaked secret: file and line only. The value is never included, logged, or sent to a model. */
export const SecretFinding = z.object({
  file: z.string().min(1),
  line: z.number().int().positive(),
  rule: z.string().min(1),
});
export type SecretFinding = z.infer<typeof SecretFinding>;

/** PR quality check: deterministic signals plus an optional fast-classifier score. */
export const QualityCheck = z.object({
  needsCloserLook: z.boolean(),
  reasons: z.array(z.string()),
});
export type QualityCheck = z.infer<typeof QualityCheck>;

export const PrRisk = z.object({
  level: RiskLevel,
  reasons: z.array(z.string()).min(1),
  coverage: AnalysisCoverage,
  secretFindings: z.array(SecretFinding).optional(),
  quality: QualityCheck.optional(),
});
export type PrRisk = z.infer<typeof PrRisk>;

export const TriageLane = z.enum(["needs_you", "fyi", "ignore"]);
export type TriageLane = z.infer<typeof TriageLane>;

/** Where a lane came from: deterministic rules, or rules raised by the model. */
export const TriageSource = z.enum(["rules", "ai"]);
export type TriageSource = z.infer<typeof TriageSource>;

export const TriageItem = z.object({
  prRef: PrRef,
  lane: TriageLane,
  reason: z.string(),
  /** Plain reasons behind the lane. Rendered as plain text. */
  reasons: z.array(z.string()).optional(),
  source: TriageSource.optional(),
  title: z.string().optional(),
  author: z.string().optional(),
});
export type TriageItem = z.infer<typeof TriageItem>;

export const TriageQueue = z.array(TriageItem);
export type TriageQueue = z.infer<typeof TriageQueue>;

export const TriageChoice = z.object({
  lane: TriageLane,
});
export type TriageChoice = z.infer<typeof TriageChoice>;

/** AI consent state. `at` is absent until consent is first recorded. */
export const ConsentState = z.object({
  ai: z.object({
    granted: z.boolean(),
    version: z.string().min(1),
    at: IsoDateTime.optional(),
  }),
});
export type ConsentState = z.infer<typeof ConsentState>;

/** Body for recording AI consent. */
export const ConsentUpdate = z.object({
  ai: z.object({
    granted: z.boolean(),
    version: z.string().min(1),
  }),
});
export type ConsentUpdate = z.infer<typeof ConsentUpdate>;

/** Highlight result. The request id matches the `x-request-id` response header. */
export const HighlightResult = z.object({
  insight: z.string().min(1),
  requestId: z.string().min(1),
});
export type HighlightResult = z.infer<typeof HighlightResult>;

/** Stored triage choice echoed back after recording. */
export const TriageRecord = z.object({
  prRef: PrRef,
  lane: TriageLane,
});
export type TriageRecord = z.infer<typeof TriageRecord>;

/** Exact shape the model must return for a summary. Coverage is computed server-side, never trusted. */
export const ModelSummary = z.object({
  whatChanged: z.string(),
  whyItMatters: z.string(),
  suggestedFocus: z.array(z.string()),
});
export type ModelSummary = z.infer<typeof ModelSummary>;

/** Exact shape the model must return for risk. Level floors and coverage attach server-side. */
export const ModelRisk = z.object({
  level: RiskLevel,
  reasons: z.array(z.string()).min(1),
});
export type ModelRisk = z.infer<typeof ModelRisk>;

/** Exact shape the model must return for triage. The lane can only raise the deterministic lane server-side. */
export const ModelTriage = z.object({
  lane: TriageLane,
  reasons: z.array(z.string()).min(1),
});
export type ModelTriage = z.infer<typeof ModelTriage>;
