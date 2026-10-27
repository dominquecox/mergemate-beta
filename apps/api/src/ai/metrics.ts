import type { AiTask, ProviderName } from "./routes";

export type AiOutcome = "ok" | "invalid_output" | "upstream_error";

export interface AiCallMetric {
  task: AiTask | "voice";
  provider: ProviderName;
  modelId: string;
  outcome: AiOutcome;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  /** Validated WAV duration; absent for formats without a trusted duration. */
  audioSeconds?: number;
}

/**
 * Writes one Analytics Engine data point for a model call. Carries task, route, outcome and
 * counts only, never prompt or output text. Voice appends measured seconds, whole
 * billable seconds, and a duration-known flag; the first three positions stay unchanged. A metering failure never fails the request.
 */
export const recordAiCall = (dataset: AnalyticsEngineDataset | undefined, metric: AiCallMetric): void => {
  if (!dataset) return;
  try {
    const durationKnown=typeof metric.audioSeconds==='number' && Number.isFinite(metric.audioSeconds) && metric.audioSeconds>=0;
    const seconds=durationKnown?metric.audioSeconds ?? 0:0;
    dataset.writeDataPoint({
      blobs: [metric.task, metric.provider, metric.modelId, metric.outcome],
      doubles: [metric.inputTokens, metric.outputTokens, metric.latencyMs, ...(metric.task === "voice" ? [seconds, Math.floor(seconds), durationKnown ? 1 : 0] : [])],
    });
  } catch {
    // Metering is best effort.
  }
};
