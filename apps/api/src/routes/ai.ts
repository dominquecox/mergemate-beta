import { PrQuestion, PrRef } from "@mergemate/contracts";
import { type Context, Hono } from "hono";
import {
  actionHeaders,
  actionLimits,
  askPr,
  assessPrRisk,
  createFetchTransport,
  githubPrDataSource,
  noStore,
  planReview,
  prRefString,
  summarizePr,
} from "./ai-engine";
import { demoAiFor } from "./ai-demo-fixtures";
import type { AiDeps, PrDataSource, PrRefParts } from "./ai-engine";
import type { ModelTransport } from "../ai/provider";
import { requireBinding } from "../config";
import type { AiBinding, AppEnv } from "../env";
import { ApiError } from "../errors";

export interface AiRouterDeps {
  transport?: ModelTransport;
  /** Workers AI binding override; defaults to the Worker's `AI` binding. */
  ai?: AiBinding;
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
      ai: deps.ai ?? c.env.AI,
      prSource: deps.prSource ?? githubPrDataSource(c.env, requestDeps),
      limits: actionLimits(c.env),
    };
  };

  router.post("/:owner/:repo/:number/summary", async (c) => {
    const session = c.get("session");
    const ref = parseRef(c.req.param("owner"), c.req.param("repo"), c.req.param("number"));
    if (session.demo) {
      return c.json(demoAiFor(ref).summary, 200, actionHeaders({ limit: 30, remaining: 30 }));
    }
    const result = await summarizePr(aiDeps(c), session, ref, c.env);
    return c.json(result.body, 200, actionHeaders(result));
  });

  router.post("/:owner/:repo/:number/risk", async (c) => {
    const session = c.get("session");
    const ref = parseRef(c.req.param("owner"), c.req.param("repo"), c.req.param("number"));
    if (session.demo) {
      return c.json(demoAiFor(ref).risk, 200, actionHeaders({ limit: 30, remaining: 30 }));
    }
    const result = await assessPrRisk(aiDeps(c), session, ref, c.env);
    return c.json(result.body, 200, actionHeaders(result));
  });

  router.post("/:owner/:repo/:number/plan", async (c) => {
    const session = c.get("session");
    const ref = parseRef(c.req.param("owner"), c.req.param("repo"), c.req.param("number"));
    if (session.demo) {
      return c.json(demoAiFor(ref).plan, 200, actionHeaders({ limit: 30, remaining: 30 }));
    }
    const result = await planReview(aiDeps(c), session, ref, c.env);
    return c.json(result.body, 200, actionHeaders(result));
  });

  router.post("/:owner/:repo/:number/ask", async (c) => {
    const session = c.get("session");
    const ref = parseRef(c.req.param("owner"), c.req.param("repo"), c.req.param("number"));
    const body: unknown = await c.req.json().catch(() => undefined);
    if (session.demo) {
      if (!PrQuestion.safeParse(body).success) throw new ApiError("validation_failed", "Ask a question of 3 to 300 characters.");
      return c.json(demoAiFor(ref).answer, 200, actionHeaders({ limit: 30, remaining: 30 }));
    }
    const result = await askPr(aiDeps(c), session, ref, body, c.env);
    return c.json(result.body, 200, actionHeaders(result));
  });

  return router;
};
