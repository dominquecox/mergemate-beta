import { PrRef } from "@mergemate/contracts";
import { type Context, Hono } from "hono";
import {
  FIXTURE_RISK,
  FIXTURE_SUMMARY,
  actionHeaders,
  actionLimits,
  assessPrRisk,
  createFetchTransport,
  githubPrDataSource,
  noStore,
  prRefString,
  summarizePr,
} from "./ai-engine";
import type { AiDeps, PrDataSource, PrRefParts } from "./ai-engine";
import type { ModelTransport } from "../ai/provider";
import { requireBinding } from "../config";
import type { AppEnv } from "../env";
import { ApiError } from "../errors";

export interface AiRouterDeps {
  transport?: ModelTransport;
  prSource?: PrDataSource;
}

const NAME_PATTERN = /^[A-Za-z0-9_.-]+$/;

const parseRef = (owner: string, repo: string, number: string): PrRefParts => {
  if (!NAME_PATTERN.test(owner) || !NAME_PATTERN.test(repo)) {
    throw new ApiError("validation_failed", "That pull request reference is not valid.");
  }
  if (!/^\d+$/.test(number)) {
    throw new ApiError("validation_failed", "That pull request reference is not valid.");
  }
  const ref = { owner, repo, number: Number.parseInt(number, 10) };
  if (!PrRef.safeParse(prRefString(ref)).success) {
    throw new ApiError("validation_failed", "That pull request reference is not valid.");
  }
  return ref;
};

export const createAiRouter = (deps: AiRouterDeps = {}) => {
  const router = new Hono<AppEnv>();
  router.use(noStore);

  const aiDeps = (c: Context<AppEnv>): AiDeps => {
    const requestDeps = c.get("deps");
    return {
      db: requireBinding(c.env, "DB"),
      transport: deps.transport ?? createFetchTransport(requestDeps.fetch),
      prSource: deps.prSource ?? githubPrDataSource(c.env, requestDeps),
      limits: actionLimits(c.env),
    };
  };

  router.post("/:owner/:repo/:number/summary", async (c) => {
    const session = c.get("session");
    const ref = parseRef(c.req.param("owner"), c.req.param("repo"), c.req.param("number"));
    if (session.demo) {
      return c.json(FIXTURE_SUMMARY, 200, actionHeaders({ limit: 30, remaining: 30 }));
    }
    const result = await summarizePr(aiDeps(c), session, ref, c.env);
    return c.json(result.body, 200, actionHeaders(result));
  });

  router.post("/:owner/:repo/:number/risk", async (c) => {
    const session = c.get("session");
    const ref = parseRef(c.req.param("owner"), c.req.param("repo"), c.req.param("number"));
    if (session.demo) {
      return c.json(FIXTURE_RISK, 200, actionHeaders({ limit: 30, remaining: 30 }));
    }
    const result = await assessPrRisk(aiDeps(c), session, ref, c.env);
    return c.json(result.body, 200, actionHeaders(result));
  });

  return router;
};
