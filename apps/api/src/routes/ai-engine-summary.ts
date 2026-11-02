import {executionTelemetry} from '../ai/execution-telemetry';
import type {CompletionResult} from '../ai/provider';
import { ModelSummary, PrSummary } from "@mergemate/contracts";
import { createModelProvider } from "../ai/provider";
import { SUMMARY_JSON_SCHEMA } from "../ai/schemas";
import { getSettings } from "../lib/settings";
import type { SessionRecord } from "../lib/sessions";
import type { Env } from "../env";
import { ApiError } from "../errors";
import { AiActionLimits, AiDeps, AiRunResult, AiStores, cacheKey, claimWork, gateAction, policyWorkKey, releaseWork, runModelTask, storesFor, userKey, waitForResult, withReservation } from "./ai-engine-gate";
import { SUMMARY_MAX_TOKENS, SUMMARY_SYSTEM, buildPrPrompt } from "./ai-engine-model";
import { PrData, PrRefParts, prRefString } from "./ai-engine-pr-data";
import { buildDiffContext, redactSecrets } from "./ai-engine-scan";

export const summarizePr = async (
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
  const { limit, remaining, model, limits } = await gateAction(stores, deps.limits, session, { ...env, DB: deps.db }, "summary");

  const data = await deps.prSource(session, ref);
  if (!data) throw new ApiError("upstream_unavailable", "PR data is unavailable right now. Try again later.");
  const refStr = prRefString(ref);
  const key = cacheKey(userId, refStr, data.headSha, "summary");
  const workKey=policyWorkKey(key,stores.policy?.revision);
  const hit = await stores.cache.get<PrSummary>(key);
  if (hit) return { body: hit, limit, remaining };
  // Identical work already running for this user (a double tap, two tabs): wait for its result, charge nothing.
  if (!(await claimWork(deps.db,workKey,userId))) {
    const shared = await waitForResult<PrSummary>(deps,stores.cache,key,workKey);
    if (shared) return { body: shared, limit, remaining };
    if (!(await claimWork(deps.db,workKey,userId))) {
      throw new ApiError("upstream_unavailable", "This summary is still being prepared. Try again in a moment.");
    }
  }
  try {
    return await generateSummary(deps, stores, env, { key, userId, limit, model, limits }, data);
  } finally {
    await releaseWork(deps.db,workKey).catch(() => undefined);
  }
};

export const generateSummary = async (
  deps: AiDeps,
  stores: AiStores,
  env: Env,
  run: { key: string; userId: string; limit: number; model: Awaited<ReturnType<typeof gateAction>>["model"]; limits: AiActionLimits },
  data: PrData,
): Promise<AiRunResult> => {
  const { key, userId, limit, model, limits } = run;
  const provider = createModelProvider(model.env, "summary", deps);
  // Each route gets only as much PR context as its model's window holds; coverage reports the rest.
  const { context, coverage } = buildDiffContext(data, provider.config.maxInputChars);
  const { text } = redactSecrets(context);
  const { value: body, remaining: left } = await withReservation(stores, limits, userId, limit, async () => {
    let execution:{reply:CompletionResult;latency:number}|undefined;
    const answer = await runModelTask(
      env,
      provider,
      "summary",
      {
        system: SUMMARY_SYSTEM,
        prompt: buildPrPrompt(text),
        maxOutputTokens: SUMMARY_MAX_TOKENS,
        jsonSchema: SUMMARY_JSON_SCHEMA,
      },
      ModelSummary,stores.policy,(reply,latency)=>{execution={reply,latency};},
    );
    const result: PrSummary = { ...answer, coverage, model: `${execution?.reply.provider??provider.config.provider}:${execution?.reply.modelId??provider.config.modelId}`, ...(execution?{telemetry:executionTelemetry(execution.reply,execution.latency,deps.requestId??crypto.randomUUID(),{task:"summary",coverage,summary:answer})}:{}) };
    await stores.cache.set(key, userId, result);
    return result;
  });
  return { body, limit, remaining: left };
};

/** Errors that end the AI part of a risk check without hiding the rule-based result: limits, model down, bad answer. */
