import { ModelRisk, PrRisk } from "@mergemate/contracts";
import type { AnalysisCoverage } from "@mergemate/contracts";
import { createModelProvider } from "../ai/provider";
import { RISK_JSON_SCHEMA } from "../ai/schemas";
import { getSettings } from "../lib/settings";
import type { SessionRecord } from "../lib/sessions";
import type { Env } from "../env";
import { ApiError, ConfigError } from "../errors";
import { AiDeps, AiRunResult, cacheKey, gateAction, runModelTask, storesFor, userKey, withReservation } from "./ai-engine-gate";
import { RISK_MAX_TOKENS, RISK_SYSTEM, buildPrPrompt } from "./ai-engine-model";
import { PrData, PrRefParts, prRefString } from "./ai-engine-pr-data";
import { buildDiffContext, redactSecrets } from "./ai-engine-scan";
import { classifyPr } from "./ai-engine-classifier";
import { assessQuality, assessRiskSignals, commonSignals, maxLevel } from "./ai-engine-signals";

export const RULES_FALLBACK = new Set(["rate_limited", "upstream_unavailable", "misconfigured"]);
export const isRulesFallback = (error: unknown): error is ApiError => error instanceof ApiError && RULES_FALLBACK.has(error.code);

/** The rule-based part of a risk check. Needs no model, so it is always available once the PR is readable. */
export const ruleRisk = (data: PrData, coverage: AnalysisCoverage, classifierScore: number | null = null) => {
  const signals = commonSignals(data);
  const deterministic = assessRiskSignals({
    files: signals.files,
    totalChanged: signals.totalChanged,
    secretFindings: signals.secretFindings,
    hasTests: data.hasTests,
    checksFailing: data.checksFailing,
  });
  const quality = assessQuality({ ...signals.qualityInput, classifierScore });
  return {
    deterministic,
    rest: {
      coverage,
      secretFindings: signals.secretFindings,
      quality: { needsCloserLook: quality.needsCloserLook, reasons: quality.reasons },
    },
  };
};

/**
 * Full risk pipeline: deterministic signals floor the model level, never the reverse. When the AI part cannot run
 * (daily limit, model unavailable or an unusable answer) the rule-based result is returned on its own, marked as
 * such and not cached, so a possible secret or failing check is never hidden by an AI outage.
 */
export const assessPrRisk = async (
  deps: AiDeps,
  session: SessionRecord,
  ref: PrRefParts,
  env: Env,
): Promise<AiRunResult> => {
  const userId = userKey(session);
  if (!session.demo && !(await getSettings({ ...env, DB: deps.db }, userId)).aiSummaries) {
    throw new ApiError("forbidden", "AI summaries and risk are turned off in Settings.");
  }
  const stores = storesFor(deps.db);
  let gate: Awaited<ReturnType<typeof gateAction>> | undefined;
  let data: PrData | null = null;
  const rulesOnly = async (error: ApiError): Promise<AiRunResult> => {
    if (error.code !== "rate_limited") {
      // Same content-free detail the error handler would have logged; the client sees the rule-based result.
      const detail = error instanceof ConfigError ? error.detail : error.logDetail;
      console.error(JSON.stringify({ event: "risk_rules_only", code: error.code, ...(detail ? { detail } : {}) }));
    }
    data ??= await deps.prSource(session, ref);
    if (!data) throw error;
    const { coverage } = buildDiffContext(data);
    const { deterministic, rest } = ruleRisk(data, coverage);
    const why = error.code === "rate_limited"
      ? "AI review is paused: the daily AI limit is reached. Rule-based checks only."
      : "AI review is unavailable right now. Rule-based checks only.";
    const body: PrRisk = { level: deterministic.level, reasons: [...deterministic.reasons, why], ...rest, assessedBy: "rules" };
    return { body, limit: gate?.limit ?? 0, remaining: error.code === "rate_limited" ? 0 : (gate?.remaining ?? 0) };
  };
  try {
    gate = await gateAction(stores, deps.limits, session, { ...env, DB: deps.db }, "risk");
  } catch (error) {
    if (isRulesFallback(error)) return rulesOnly(error);
    throw error;
  }
  const { limit, model, limits } = gate;

  data = await deps.prSource(session, ref);
  if (!data) throw new ApiError("upstream_unavailable", "PR data is unavailable right now. Try again later.");
  const prData = data;
  const refStr = prRefString(ref);
  const key = cacheKey(userId, refStr, prData.headSha, "risk");
  const hit = await stores.cache.get<PrRisk>(key);
  if (hit) return { body: hit, limit, remaining: gate.remaining };
  try {
    const provider = createModelProvider(model.env, "risk", deps);
    // Each route gets only as much PR context as its model's window holds; coverage reports the rest.
    const { context, coverage } = buildDiffContext(prData, provider.config.maxInputChars);
    const { text } = redactSecrets(context);
    const { value: body, remaining: left } = await withReservation(stores, limits, userId, limit, async () => {
      // The fast classifier runs beside the risk model under the same reserved action. It only feeds the quality
      // badge (classifierScore); the rule-based level floor and secret findings are untouched.
      const classifier = classifyPr(model.env, deps.ai, text);
      const answer = await runModelTask(
        env,
        provider,
        "risk",
        {
          system: RISK_SYSTEM,
          prompt: buildPrPrompt(text),
          maxOutputTokens: RISK_MAX_TOKENS,
          jsonSchema: RISK_JSON_SCHEMA,
        },
        ModelRisk,stores.policy,
      );
      const { deterministic, rest } = ruleRisk(prData, coverage, await classifier);
      const reasons = [...deterministic.reasons, ...answer.reasons].filter(
        (reason, index, all) => all.indexOf(reason) === index,
      );
      const result: PrRisk = { level: maxLevel(deterministic.level, answer.level), reasons, ...rest, assessedBy: "rules_and_ai" };
      await stores.cache.set(key, userId, result);
      return result;
    });
    return { body, limit, remaining: left };
  } catch (error) {
    if (isRulesFallback(error)) return rulesOnly(error);
    throw error;
  }
};
