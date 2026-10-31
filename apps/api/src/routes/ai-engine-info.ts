import type { AiEngineInfo } from "@mergemate/contracts";
import { Hono } from "hono";
import { resolveAiProfile, resolveRoute } from "../ai/routes";
import type { AiTask } from "../ai/routes";
import type { AppEnv } from "../env";
import { ConfigError } from "../errors";

const JOBS = ["summary", "risk", "highlight", "segment", "decision"] as const satisfies readonly AiTask[];

/**
 * Which model serves each AI job, from Worker config. Names only: no keys, no base URLs. A job whose
 * route is unset or not allowed is left out rather than guessed.
 */
export const aiEngine = new Hono<AppEnv>().get("/engine", (c) => {
  const body: AiEngineInfo = { profile: resolveAiProfile(c.env), jobs: [] };
  for (const task of JOBS) {
    try {
      const route = resolveRoute(c.env, task);
      body.jobs.push({ task, model: `${route.provider}:${route.modelId}` });
    } catch (error) {
      if (!(error instanceof ConfigError)) throw error;
    }
  }
  return c.json(body, 200, { "cache-control": "no-store" });
});
