import { createDecisionProvider } from "../ai/provider";
import { recordAiCall } from "../ai/metrics";
import type { AiBinding, Env } from "../env";
import type { DecisionQuestion } from "../ai/provider";
import { resolveRoute } from "../ai/routes";

const CLASSIFIER_QUESTION: DecisionQuestion = {
  id: "needs_closer_look",
  type: "noul",
  question: "Does this pull request need a closer human look before merging?",
};

/** True when a decision route is configured (MODEL_ROUTE_DECISION, or the prod profile default). Unset means off. */
export const classifierEnabled = (env: Env, ai: AiBinding | undefined): boolean => {
  if (!ai) return false;
  try {
    resolveRoute(env, "decision");
    return true;
  } catch {
    return false;
  }
};

/**
 * Asks the fast decision model (Clef-flash) whether this PR needs a closer look and returns the "yes"
 * probability as the quality `classifierScore`. `maskedContext` must already be redacted. Best effort:
 * any failure (missing route, timeout, invalid answer) returns null and the rules-only quality result stands.
 * Metered as one content-free data point; it rides the risk action's reservation, so it adds no extra action.
 */
export const classifyPr = async (
  env: Env,
  ai: AiBinding | undefined,
  maskedContext: string,
): Promise<number | null> => {
  if (!classifierEnabled(env, ai)) return null;
  const started = Date.now();
  let modelId = "";
  try {
    const provider = createDecisionProvider(env, { ai });
    modelId = provider.config.modelId;
    const result = await provider.completeDecision({ state: maskedContext.slice(0, provider.config.maxInputChars), questions: [CLASSIFIER_QUESTION] });
    const score = result.answers[0]?.probabilities["yes"];
    const ok = typeof score === "number" && Number.isFinite(score);
    recordAiCall(env.AI_METRICS, {
      task: "decision", provider: "workers-ai", modelId, outcome: ok ? "ok" : "invalid_output",
      inputTokens: 0, outputTokens: 0, latencyMs: Date.now() - started,
    });
    return ok ? Math.min(1, Math.max(0, score)) : null;
  } catch {
    if (modelId) {
      recordAiCall(env.AI_METRICS, {
        task: "decision", provider: "workers-ai", modelId, outcome: "upstream_error",
        inputTokens: 0, outputTokens: 0, latencyMs: Date.now() - started,
      });
    }
    return null;
  }
};
