import { describe, expect, it } from "vitest";
import type { SessionRecord } from "../src/lib/sessions";
import { ApiError } from "../src/errors";
import type { Env } from "../src/env";
import { createDbConsentStore } from "../src/routes/consent";
import { assessPrRisk, cacheKey, storesFor, summarizePr } from "../src/routes/ai-engine";
import type { AiDeps, PrData } from "../src/routes/ai-engine";
import { TestD1 } from "./d1";
import { fakeAi, fakeDataset, mockTransport, validModelEnv } from "./helpers";

const LLAMA = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const PR_MARKER = "UNIQUE-PR-TITLE-MARKER";
const ANSWER_MARKER = "UNIQUE-ANSWER-MARKER";
const summaryText = JSON.stringify({ whatChanged: ANSWER_MARKER, whyItMatters: "y", suggestedFocus: [] });
const riskText = JSON.stringify({ level: "low", reasons: [ANSWER_MARKER] });
const ref = { owner: "o", repo: "r", number: 1 };

const user: SessionRecord = {
  tokenHash: "test-hash",
  userId: "u1",
  demo: false,
  transport: "bearer",
  csrfToken: null,
  expiresAt: "2026-11-26T12:00:00.000Z",
  userStatus: "active",
};

const prData = (): PrData => ({
  title: PR_MARKER,
  description: "d",
  headSha: "abc",
  files: [{ path: "src/sync.ts", patch: "run();", additions: 2, deletions: 1 }],
  authorIsBot: false,
  coAuthoredByBot: false,
  hasTests: true,
  checksFailing: false,
});

const setup = async (overrides: Partial<AiDeps> = {}): Promise<AiDeps> => {
  const db = new TestD1() as unknown as D1Database;
  await db
    .prepare(
      `INSERT INTO users (id, github_id, login, name, avatar_url, status, created_at, updated_at)
       VALUES ('u1', 4242, 'user-4242', 'Test User', 'https://example.com/a.png', 'active', '2026-10-26T00:00:00Z', '2026-10-26T00:00:00Z')`,
    )
    .run();
  await createDbConsentStore(db).write("u1", true);
  return {
    db,
    transport: mockTransport(async () => ({ text: summaryText })),
    prSource: async () => prData(),
    limits: { free: 30, pro: 500, global: 100 },
    ...overrides,
  };
};

const used = async (deps: AiDeps) => (await storesFor(deps.db).usage.check("u1", 30)).remaining;

const apiError = async (run: () => Promise<unknown>): Promise<ApiError> => {
  try {
    await run();
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error("expected an ApiError");
};

describe("model router in the AI pipeline", () => {
  it("sends summary to meta and risk to workers-ai by default", async () => {
    const transport = mockTransport(async () => ({ text: summaryText }));
    const ai = fakeAi(async () => ({ response: riskText }));
    const deps = await setup({ transport, ai });
    const env = validModelEnv();

    await summarizePr(deps, user, ref, env);
    expect(transport.calls).toHaveLength(1);
    expect(transport.calls[0]?.config).toMatchObject({ provider: "meta", modelId: "muse-spark-1.2" });
    expect(ai.runs).toHaveLength(0);

    await assessPrRisk(deps, user, ref, env);
    expect(transport.calls).toHaveLength(1);
    expect(ai.runs).toHaveLength(1);
    expect(ai.runs[0]?.model).toBe(LLAMA);
  });

  it("keeps PR content as delimited data under the fixed system prompt on workers-ai", async () => {
    const ai = fakeAi(async () => ({ response: riskText }));
    const deps = await setup({ ai });
    await assessPrRisk(deps, user, ref, validModelEnv());
    const inputs = ai.runs[0]?.inputs as {
      messages: { role: string; content: string }[];
      max_tokens: number;
      response_format: { type: string; json_schema: { properties: Record<string, unknown> } };
    };
    expect(inputs.messages.map((m) => m.role)).toEqual(["system", "user"]);
    expect(inputs.messages[0]?.content).not.toContain(PR_MARKER);
    expect(inputs.messages[1]?.content).toMatch(/^<pr_data>\n[\s\S]*\n<\/pr_data>$/);
    expect(inputs.messages[1]?.content).toContain(PR_MARKER);
    expect(inputs.max_tokens).toBe(400);
    expect(inputs.response_format.type).toBe("json_schema");
    expect(Object.keys(inputs.response_format.json_schema.properties)).toEqual(["level", "reasons"]);
  });

  it("switches risk to meta by config", async () => {
    const transport = mockTransport(async () => ({ text: riskText }));
    const ai = fakeAi();
    const deps = await setup({ transport, ai });
    const env = { ...validModelEnv(), MODEL_ROUTE_RISK: "meta:muse-spark-1.2" };
    const result = await assessPrRisk(deps, user, ref, env);
    expect(result.body).toMatchObject({ level: "low" });
    expect(transport.calls).toHaveLength(1);
    expect(ai.runs).toHaveLength(0);
  });

  it("fails on an unset or disallowed route with no fallback and no reservation", async () => {
    const transport = mockTransport();
    const ai = fakeAi();
    const deps = await setup({ transport, ai });
    const unset = validModelEnv();
    delete unset.MODEL_ROUTE_RISK;
    const envs: Env[] = [
      unset,
      { ...validModelEnv(), MODEL_ROUTE_RISK: "meta:muse-spark-1.2-contributor" },
      { ...validModelEnv(), MODEL_ROUTE_RISK: "workers-ai:@cf/other/model" },
    ];
    for (const env of envs) {
      const err = await apiError(() => assessPrRisk(deps, user, ref, env));
      expect(err.code).toBe("misconfigured");
    }
    expect(transport.calls).toHaveLength(0);
    expect(ai.runs).toHaveLength(0);
    expect(await used(deps)).toBe(30);
  });

  it("fails closed when a workers-ai route has no AI binding", async () => {
    const deps = await setup();
    const err = await apiError(() => assessPrRisk(deps, user, ref, validModelEnv()));
    expect(err.code).toBe("misconfigured");
    expect(await used(deps)).toBe(30);
  });

  it.each([
    ["a thrown error", () => Promise.reject(new Error("5006: upstream detail"))],
    ["a JSON mode failure", () => Promise.reject(new Error("JSON Mode couldn't be met"))],
    ["no response", () => Promise.resolve({})],
  ])("maps %s to upstream_unavailable and releases the reservation", async (_name, reply) => {
    const deps = await setup({ ai: fakeAi(reply) });
    const err = await apiError(() => assessPrRisk(deps, user, ref, validModelEnv()));
    expect(err.code).toBe("upstream_unavailable");
    expect(err.message).not.toContain("upstream detail");
    expect(err.message).not.toContain("JSON Mode");
    expect(await used(deps)).toBe(30);
    expect((await storesFor(deps.db).usage.check("global", 100)).remaining).toBe(100);
  });

  it.each([
    ["text that is not JSON", "not json"],
    ["JSON that fails the schema", JSON.stringify({ level: "critical", reasons: ["x"] })],
    ["an object that fails the schema", { level: "low" }],
  ])("discards %s, caches nothing and releases the reservation", async (_name, response) => {
    const deps = await setup({ ai: fakeAi(async () => ({ response })) });
    const err = await apiError(() => assessPrRisk(deps, user, ref, validModelEnv()));
    expect(err.code).toBe("upstream_unavailable");
    expect(err.message).not.toContain("critical");
    expect(await used(deps)).toBe(30);
    expect(await storesFor(deps.db).cache.get(cacheKey("u1", "o/r#1", "abc", "risk"))).toBeUndefined();
  });

  it("passes the gateway option only when AI_GATEWAY_ID is set", async () => {
    const ai = fakeAi(async () => ({ response: riskText }));
    const deps = await setup({ ai });
    await assessPrRisk(deps, user, ref, validModelEnv());
    expect(ai.runs[0]?.argCount).toBe(2);

    const gated = fakeAi(async () => ({ response: riskText }));
    const deps2 = await setup({ ai: gated });
    await assessPrRisk(deps2, user, ref, { ...validModelEnv(), AI_GATEWAY_ID: "gw-1" });
    expect(gated.runs[0]?.options).toEqual({ gateway: { id: "gw-1" } });
  });
});

describe("route limits", () => {
  it("allows only vision-capable routes for highlight and keeps vision-only models off text tasks", async () => {
    const { resolveRoute } = await import("../src/ai/routes");
    const env = (overrides: Partial<Env>) => ({ ...validModelEnv(), ...overrides }) as Env;
    expect(() => resolveRoute(env({ MODEL_ROUTE_HIGHLIGHT: `workers-ai:${LLAMA}` }), "highlight")).toThrow();
    expect(resolveRoute(env({ MODEL_ROUTE_HIGHLIGHT: "meta:muse-spark-1.2" }), "highlight").provider).toBe("meta");
    expect(() => resolveRoute(env({ MODEL_ROUTE_RISK: "workers-ai:@cf/meta/llama-4-scout-17b-16e-instruct" }), "risk")).toThrow();
  });

  it("fits risk context into the Llama 3.3 window and reports what was left out", async () => {
    const ai = fakeAi(async () => ({ response: riskText }));
    const big = prData();
    big.files = Array.from({ length: 20 }, (_, i) => ({ path: `src/f${i}.ts`, patch: "x".repeat(7000), additions: 100, deletions: 0 }));
    const deps = await setup({ ai, prSource: async () => big });
    const result = await assessPrRisk(deps, user, ref, validModelEnv());
    const inputs = ai.runs[0]?.inputs as { messages: { content: string }[] };
    expect(inputs.messages[1]?.content.length).toBeLessThan(55_000);
    expect(result.body.coverage.skippedFiles).toBeGreaterThan(0);
  });
});

describe("Muse Spark Open on Workers AI", () => {
  const OPEN = "meta/muse-spark-open";
  const openEnv = () => ({ ...validModelEnv(), MODEL_ROUTE_RISK: `workers-ai:${OPEN}` }) as Env;

  it("reads the Chat Completions answer and gives the reasoning model room to finish", async () => {
    const ai = fakeAi(async () => ({
      choices: [{ message: { content: riskText } }],
      usage: { prompt_tokens: 120, completion_tokens: 900 },
    }));
    const deps = await setup({ ai });
    const result = await assessPrRisk(deps, user, ref, openEnv());
    expect(result.body).toMatchObject({ level: "low" });
    expect(ai.runs[0]?.model).toBe(OPEN);
    const inputs = ai.runs[0]?.inputs as Record<string, unknown>;
    expect(inputs.max_completion_tokens).toBeGreaterThanOrEqual(4096);
    expect(inputs.reasoning_effort).toBe("low");
    expect(inputs).not.toHaveProperty("max_tokens");
    expect(inputs).not.toHaveProperty("response_format");
  });

  it("serves highlight too, and keeps Llama 3.3 on JSON mode for the cost profile", async () => {
    const { resolveRoute } = await import("../src/ai/routes");
    expect(resolveRoute({ ...validModelEnv(), MODEL_ROUTE_HIGHLIGHT: `workers-ai:${OPEN}` } as Env, "highlight").modelId).toBe(OPEN);
    const ai = fakeAi(async () => ({ response: riskText }));
    const deps = await setup({ ai });
    await assessPrRisk(deps, user, ref, validModelEnv());
    const inputs = ai.runs[0]?.inputs as Record<string, unknown>;
    expect(inputs.max_tokens).toBe(400);
    expect(inputs).toHaveProperty("response_format");
  });

  it("treats an empty Chat Completions answer as a failed call", async () => {
    const ai = fakeAi(async () => ({ choices: [{ message: { content: null } }] }));
    const deps = await setup({ ai });
    const error = await apiError(() => assessPrRisk(deps, user, ref, openEnv()));
    expect(error.code).toBe("upstream_unavailable");
  });
});

describe("AI metering", () => {
  it("writes one content-free data point per call, with tokens from the provider", async () => {
    const metrics = fakeDataset();
    const transport = mockTransport(async () => ({ text: summaryText, usage: { inputTokens: 100, outputTokens: 20 } }));
    const ai = fakeAi(async () => ({ response: riskText, usage: { prompt_tokens: 30, completion_tokens: 7 } }));
    const deps = await setup({ transport, ai });
    const env = { ...validModelEnv(), AI_METRICS: metrics };

    await summarizePr(deps, user, ref, env);
    expect(metrics.points).toHaveLength(1);
    await assessPrRisk(deps, user, ref, env);
    expect(metrics.points).toHaveLength(2);

    const [summary, risk] = metrics.points;
    expect(summary?.blobs).toEqual(["summary", "meta", "muse-spark-1.2", "ok"]);
    expect(summary?.doubles?.slice(0, 2)).toEqual([100, 20]);
    expect(risk?.blobs).toEqual(["risk", "workers-ai", LLAMA, "ok"]);
    expect(risk?.doubles?.slice(0, 2)).toEqual([30, 7]);
    for (const point of metrics.points) {
      expect(point.doubles).toHaveLength(3);
      expect(point.doubles?.[2]).toBeGreaterThanOrEqual(0);
      const text = JSON.stringify(point);
      expect(text).not.toContain(PR_MARKER);
      expect(text).not.toContain(ANSWER_MARKER);
      expect(text).not.toContain("<pr_data>");
    }
  });

  it("records invalid output and upstream errors as outcomes", async () => {
    const metrics = fakeDataset();
    const env = { ...validModelEnv(), AI_METRICS: metrics };

    const invalid = await setup({ ai: fakeAi(async () => ({ response: "not json", usage: { prompt_tokens: 9, completion_tokens: 2 } })) });
    await apiError(() => assessPrRisk(invalid, user, ref, env));
    expect(metrics.points).toHaveLength(1);
    expect(metrics.points[0]?.blobs).toEqual(["risk", "workers-ai", LLAMA, "invalid_output"]);
    expect(metrics.points[0]?.doubles?.slice(0, 2)).toEqual([9, 2]);

    const failing = await setup({
      ai: fakeAi(async () => {
        throw new Error("JSON Mode couldn't be met");
      }),
    });
    await apiError(() => assessPrRisk(failing, user, ref, env));
    expect(metrics.points).toHaveLength(2);
    expect(metrics.points[1]?.blobs).toEqual(["risk", "workers-ai", LLAMA, "upstream_error"]);
    expect(metrics.points[1]?.doubles?.slice(0, 2)).toEqual([0, 0]);
  });

  it("writes nothing for a cache hit or a config error", async () => {
    const metrics = fakeDataset();
    const env = { ...validModelEnv(), AI_METRICS: metrics };
    const deps = await setup({ ai: fakeAi(async () => ({ response: riskText })) });
    await assessPrRisk(deps, user, ref, env);
    await assessPrRisk(deps, user, ref, env);
    expect(metrics.points).toHaveLength(1);
    await apiError(() => assessPrRisk(deps, user, { ...ref, number: 2 }, { ...env, MODEL_ROUTE_RISK: "" }));
    expect(metrics.points).toHaveLength(1);
  });

  it("does not fail the request when metering fails", async () => {
    const env = { ...validModelEnv(), AI_METRICS: fakeDataset(true) };
    const deps = await setup({ ai: fakeAi(async () => ({ response: riskText })) });
    const result = await assessPrRisk(deps, user, ref, env);
    expect(result.body).toMatchObject({ level: "low" });
    const failing = await setup({ ai: fakeAi(async () => Promise.reject(new Error("x"))) });
    const err = await apiError(() => assessPrRisk(failing, user, ref, env));
    expect(err.code).toBe("upstream_unavailable");
  });

  it("works without an AI_METRICS binding", async () => {
    const deps = await setup({ ai: fakeAi(async () => ({ response: riskText })) });
    await expect(assessPrRisk(deps, user, ref, validModelEnv())).resolves.toBeDefined();
  });
});
