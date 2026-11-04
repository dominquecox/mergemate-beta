/**
 * MM-120: model wiring for the agent runtime.
 *
 * Planning goes through the same AI gate as every other AI action: consent,
 * the user's plan cap or own Meta key, and the shared free pool, with one
 * action reserved before the model is called and given back if it fails.
 * The provider comes from the user's own model context, so an own key is
 * used when the user has one. The prompt is secret-redacted first.
 */
import type { Deps, Env } from "../../env";
import { ApiError } from "../../errors";
import type { SessionRecord } from "../../lib/sessions";
import { createModelProvider } from "../../ai/provider";
import type { AiTask } from "../../ai/routes";
import { actionLimits, gateAction, runModelTask, storesFor, triagePoolLimit, withReservation, type AnswerSchema } from "../../routes/ai-engine-gate";
import { createFetchTransport, DATA_NOTICE } from "../../routes/ai-engine-model";
import { redactSecrets } from "../../routes/ai-engine-scan";
import type { ModelPort } from "./types";

export const BRAIN_MODEL_TASK: AiTask = "triage";

const JSON_OBJECT: AnswerSchema<Record<string, unknown>> = {
  safeParse: (value) => (value && typeof value === "object" && !Array.isArray(value) ? { success: true, data: value as Record<string, unknown> } : { success: false }),
};

export const createGatedModel = (env: Env, deps: Pick<Deps, "fetch">, session: SessionRecord): ModelPort => ({
  complete: async (input: { system: string; prompt: string; maxOutputTokens: number }) => {
    if (!env.DB || !session.userId) throw new ApiError("misconfigured", "Brain storage is not configured.");
    const stores = storesFor(env.DB);
    const gate = await gateAction(stores, actionLimits(env), session, env, BRAIN_MODEL_TASK);
    const provider = createModelProvider(gate.model.env, BRAIN_MODEL_TASK, {
      transport: createFetchTransport(deps.fetch),
      ...(env.AI ? { ai: env.AI } : {}),
    });
    // Planning shares the triage route, so it also takes only the triage share of the free pool.
    const userLimit = triagePoolLimit(gate.limits, gate.limit);
    // runModelTask re-checks the AI policy after the call, meters it and turns provider failures into API errors.
    // The proposal's own validation runs after this, so the answer here is only required to be a JSON object.
    const { value } = await withReservation(stores, gate.limits, session.userId, userLimit, () =>
      runModelTask(env, provider, BRAIN_MODEL_TASK, { system: `${input.system} ${DATA_NOTICE}`, prompt: redactSecrets(input.prompt).text, maxOutputTokens: input.maxOutputTokens }, JSON_OBJECT, stores.policy),
    );
    return { text: JSON.stringify(value) };
  },
});
