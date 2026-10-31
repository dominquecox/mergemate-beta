import { ModelPrAnswer, ModelReviewPlan, PrAnswer, PrQuestion, ReviewPlan } from "@mergemate/contracts";
import { createModelProvider } from "../ai/provider";
import { ANSWER_JSON_SCHEMA, PLAN_JSON_SCHEMA } from "../ai/schemas";
import { getSettings } from "../lib/settings";
import type { SessionRecord } from "../lib/sessions";
import type { Env } from "../env";
import { ApiError } from "../errors";
import { AiDeps, cacheKey, claimWork, gateAction, policyWorkKey, releaseWork, runModelTask, storesFor, userKey, waitForResult, withReservation } from "./ai-engine-gate";
import { DATA_NOTICE, buildPrPrompt } from "./ai-engine-model";
import { PrData, PrRefParts, prRefString } from "./ai-engine-pr-data";
import { buildDiffContext, redactSecrets } from "./ai-engine-scan";

export const PLAN_SYSTEM =
  `You prepare a human to review a GitHub pull request. Reply with JSON only, exactly ` +
  `{"readingOrder": {"file": string, "why": string}[], "verify": string[], "draftComment": string}. ` +
  `readingOrder lists up to 8 changed files in the order a reviewer should read them, each with a one-sentence reason; use file paths exactly as given. ` +
  `verify lists up to 6 concrete things to check before approving. draftComment is a short, polite review comment the reviewer could post themselves. ` +
  DATA_NOTICE;
export const ANSWER_SYSTEM =
  `You answer a reviewer's question about one GitHub pull request, using only the PR data. Reply with JSON only, exactly ` +
  `{"answer": string, "citations": {"file": string}[]}. Cite the changed files the answer relies on, with paths exactly as given. ` +
  `If the PR data does not answer the question, say so plainly. ` +
  DATA_NOTICE;
export const PLAN_MAX_TOKENS = 900;
export const ANSWER_MAX_TOKENS = 700;

/** Provider and model that served a task, e.g. `meta:muse-spark-1.3`. */
export const modelLabel = (config: { provider: string; modelId: string }): string => `${config.provider}:${config.modelId}`;

/** Keeps only paths that are files of this PR, in the model's order, without repeats. The model cannot invent a reference. */
export const onlyPrFiles = <T extends { file: string }>(items: T[], data: PrData): T[] => {
  const known = new Set(data.files.map((f) => f.path));
  const seen = new Set<string>();
  return items.filter((item) => known.has(item.file) && !seen.has(item.file) && !!seen.add(item.file));
};

const assertSummariesOn = async (deps: AiDeps, env: Env, session: SessionRecord): Promise<void> => {
  if (!session.demo && !(await getSettings({ ...env, DB: deps.db }, userKey(session))).aiSummaries) {
    throw new ApiError("forbidden", "AI summaries and risk are turned off in Settings.");
  }
};

export interface AssistResult<T> {
  body: T;
  limit: number;
  remaining: number;
}

/** Review plan: reading order, checklist and a copy-only draft comment. Cached per head commit, one charge. */
export const planReview = async (
  deps: AiDeps,
  session: SessionRecord,
  ref: PrRefParts,
  env: Env,
): Promise<AssistResult<ReviewPlan>> => {
  const userId = userKey(session);
  await assertSummariesOn(deps, env, session);
  const stores = storesFor(deps.db);
  const { limit, remaining, model, limits } = await gateAction(stores, deps.limits, session, { ...env, DB: deps.db }, "summary");
  const data = await deps.prSource(session, ref);
  if (!data) throw new ApiError("upstream_unavailable", "PR data is unavailable right now. Try again later.");
  const key = cacheKey(userId, prRefString(ref), data.headSha, "plan");
  const workKey = policyWorkKey(key, stores.policy?.revision);
  const hit = await stores.cache.get<ReviewPlan>(key);
  if (hit) return { body: hit, limit, remaining };
  if (!(await claimWork(deps.db, workKey, userId))) {
    const shared = await waitForResult<ReviewPlan>(deps, stores.cache, key, workKey);
    if (shared) return { body: shared, limit, remaining };
    if (!(await claimWork(deps.db, workKey, userId))) {
      throw new ApiError("upstream_unavailable", "This plan is still being prepared. Try again in a moment.");
    }
  }
  try {
    const provider = createModelProvider(model.env, "summary", deps);
    const { context, coverage } = buildDiffContext(data, provider.config.maxInputChars);
    const { text } = redactSecrets(context);
    const files = data.files.map((f) => f.path).join("\n");
    const { value, remaining: left } = await withReservation(stores, limits, userId, limit, async () => {
      const answer = await runModelTask(
        env,
        provider,
        "summary",
        {
          system: PLAN_SYSTEM,
          prompt: buildPrPrompt(`${text}\nChanged files:\n${files}`),
          maxOutputTokens: PLAN_MAX_TOKENS,
          jsonSchema: PLAN_JSON_SCHEMA,
        },
        ModelReviewPlan,
        stores.policy,
      );
      const result: ReviewPlan = {
        ...answer,
        readingOrder: onlyPrFiles(answer.readingOrder, data),
        coverage,
        model: modelLabel(provider.config),
      };
      await stores.cache.set(key, userId, result);
      return result;
    });
    return { body: value, limit, remaining: left };
  } finally {
    await releaseWork(deps.db, workKey).catch(() => undefined);
  }
};

/** One grounded answer about a PR. Each question is its own reserved action and is never cached. */
export const askPr = async (
  deps: AiDeps,
  session: SessionRecord,
  ref: PrRefParts,
  input: unknown,
  env: Env,
): Promise<AssistResult<PrAnswer>> => {
  const parsed = PrQuestion.safeParse(input);
  if (!parsed.success) throw new ApiError("validation_failed", "Ask a question of 3 to 300 characters.");
  const userId = userKey(session);
  await assertSummariesOn(deps, env, session);
  const stores = storesFor(deps.db);
  const { limit, model, limits } = await gateAction(stores, deps.limits, session, { ...env, DB: deps.db }, "summary");
  const data = await deps.prSource(session, ref);
  if (!data) throw new ApiError("upstream_unavailable", "PR data is unavailable right now. Try again later.");
  const provider = createModelProvider(model.env, "summary", deps);
  const { context, coverage } = buildDiffContext(data, provider.config.maxInputChars);
  const { text } = redactSecrets(context);
  // The question is the reviewer's own words, but it is still redacted: a pasted token must not reach the model.
  const question = redactSecrets(parsed.data.question).text;
  const files = data.files.map((f) => f.path).join("\n");
  const { value, remaining } = await withReservation(stores, limits, userId, limit, async () => {
    const answer = await runModelTask(
      env,
      provider,
      "summary",
      {
        system: ANSWER_SYSTEM,
        prompt: `${buildPrPrompt(`${text}\nChanged files:\n${files}`)}\n<question>\n${question}\n</question>`,
        maxOutputTokens: ANSWER_MAX_TOKENS,
        jsonSchema: ANSWER_JSON_SCHEMA,
      },
      ModelPrAnswer,
      stores.policy,
    );
    return { ...answer, citations: onlyPrFiles(answer.citations, data), coverage, model: modelLabel(provider.config) } satisfies PrAnswer;
  });
  return { body: value, limit, remaining };
};
