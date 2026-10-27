import type { AiTask, ProviderName } from "./routes";

export type AiOutcome = "ok" | "invalid_output" | "upstream_error";

export interface AiCallMetric {
  task: AiTask;
  provider: ProviderName;
  modelId: string;
  outcome: AiOutcome;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

/**
 * Writes one Analytics Engine data point for a model call. Carries task, route, outcome and
 * counts only, never prompt or output text. A metering failure never fails the request.
 */
export const recordAiCall = (dataset: AnalyticsEngineDataset | undefined, metric: AiCallMetric): void => {
  if (!dataset) return;
  try {
    dataset.writeDataPoint({
      blobs: [metric.task, metric.provider, metric.modelId, metric.outcome],
      doubles: [metric.inputTokens, metric.outputTokens, metric.latencyMs],
    });
  } catch {
    // Metering is best effort.
  }
};
