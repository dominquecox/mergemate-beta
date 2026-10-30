import { describe, expect, it } from "vitest";
import { createDecisionProvider, createModelProvider, resolveModelConfig } from "../src/ai/provider";
import { resolveAiProfile, resolveRoute } from "../src/ai/routes";
import type { Env } from "../src/env";
import { ApiError, ConfigError } from "../src/errors";
import { fakeAi, mockTransport, TEST_API_KEY, validModelEnv } from "./helpers";

const request = { system: "s", prompt: "p", maxOutputTokens: 100 };
const LLAMA = "workers-ai:@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const SCOUT = "workers-ai:@cf/meta/llama-4-scout-17b-16e-instruct";

const configError = (run: () => unknown) => {
  try {
    run();
  } catch (err) {
    if (err instanceof ConfigError) return err;
    throw err;
  }
  throw new Error("expected a ConfigError");
};

describe("resolveRoute", () => {
  it("reads each task's route from env", () => {
    const env = validModelEnv();
    expect(resolveRoute(env, "summary")).toEqual({ provider: "meta", modelId: "muse-spark-1.2", maxInputChars: 190_000 });
    expect(resolveRoute(env, "risk")).toEqual({
      provider: "workers-ai",
      modelId: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      maxInputChars: 50_000,
    });
    expect(resolveRoute(env, "triage").provider).toBe("workers-ai");
    expect(resolveRoute(env, "highlight")).toEqual({
      provider: "workers-ai",
      modelId: "@cf/meta/llama-4-scout-17b-16e-instruct",
      maxInputChars: 190_000,
    });
  });

  it.each([
    ["summary", "MODEL_ROUTE_SUMMARY"],
    ["risk", "MODEL_ROUTE_RISK"],
    ["triage", "MODEL_ROUTE_TRIAGE"],
    ["highlight", "MODEL_ROUTE_HIGHLIGHT"],
  ] as const)("throws when the %s route is unset or blank", (task, name) => {
    for (const value of [undefined, "  "]) {
      const env: Env = { ...validModelEnv(), [name]: value };
      const err = configError(() => resolveRoute(env, task));
      expect(err.code).toBe("misconfigured");
      expect(err.detail).toBe(`${name} is not set`);
    }
  });

  it.each([
    "baseten:some-model",
    "meta:other-model",
    "workers-ai:@cf/meta/llama-3.1-8b-instruct",
    "muse-spark-1.2",
    " meta:muse-spark-1.2-extra",
  ])("rejects %s, with no fallback", (value) => {
    const err = configError(() => resolveRoute({ ...validModelEnv(), MODEL_ROUTE_RISK: value }, "risk"));
    expect(err.detail).toBe("MODEL_ROUTE_RISK is not an allowed route");
  });

  it("rejects contributor models", () => {
    for (const value of ["meta:muse-spark-1.2-contributor", `${LLAMA}-contributor`]) {
      const env = { ...validModelEnv(), MODEL_ROUTE_SUMMARY: value };
      expect(configError(() => resolveRoute(env, "summary")).detail).toBe("MODEL_ROUTE_SUMMARY is not an allowed route");
    }
  });

  it("keeps the vision model for highlight only", () => {
    expect(configError(() => resolveRoute({ ...validModelEnv(), MODEL_ROUTE_RISK: SCOUT }, "risk")).detail).toBe(
      "MODEL_ROUTE_RISK is not an allowed route",
    );
  });

  it("never puts configured values in the error", () => {
    const err = configError(() => resolveRoute({ ...validModelEnv(), MODEL_ROUTE_RISK: "secret-ish-value" }, "risk"));
    expect(err.message).not.toContain("secret-ish-value");
    expect(err.detail).not.toContain("secret-ish-value");
  });
});

describe("resolveModelConfig", () => {
  it("adds the validated base URL for meta routes", () => {
    expect(resolveModelConfig(validModelEnv(), "summary")).toEqual({
      provider: "meta",
      modelId: "muse-spark-1.2",
      maxInputChars: 190_000,
      baseUrl: "https://api.meta.ai/v1",
    });
  });

  it("does not need the base URL for workers-ai routes", () => {
    const env = { ...validModelEnv(), MODEL_BASE_URL: "" };
    expect(resolveModelConfig(env, "risk")).toEqual({
      provider: "workers-ai",
      modelId: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      maxInputChars: 50_000,
    });
  });

  it("throws when the base URL is missing for a meta route", () => {
    const err = configError(() => resolveModelConfig({ ...validModelEnv(), MODEL_BASE_URL: "  " }, "summary"));
    expect(err.code).toBe("misconfigured");
    expect(err.detail).toBe("MODEL_BASE_URL is not set");
  });

  it.each([
    ["not a url", "MODEL_BASE_URL is not a valid URL"],
    ["http://api.meta.ai/v1", "MODEL_BASE_URL must use https"],
    ["https://user:pw@api.meta.ai/v1", "MODEL_BASE_URL must not carry credentials, query or fragment"],
    ["https://api.meta.ai/v1?key=x", "MODEL_BASE_URL must not carry credentials, query or fragment"],
  ])("rejects base URL %s", (value, detail) => {
    expect(configError(() => resolveModelConfig({ ...validModelEnv(), MODEL_BASE_URL: value }, "summary")).detail).toBe(
      detail,
    );
  });
});

describe("createModelProvider (meta)", () => {
  it("throws before any call when the API key is missing", () => {
    const transport = mockTransport();
    const env = { ...validModelEnv() };
    delete env.MODEL_API_KEY;
    expect(() => createModelProvider(env, "summary", { transport })).toThrow(ConfigError);
    expect(transport.calls).toHaveLength(0);
  });

  it("calls the transport with the resolved config and returns the model used", async () => {
    const transport = mockTransport();
    const provider = createModelProvider(validModelEnv(), "summary", { transport });
    await expect(provider.complete(request)).resolves.toEqual({
      text: "mock reply",
      provider: "meta",
      modelId: "muse-spark-1.2",
    });
    expect(transport.calls).toEqual([{ config: provider.config, apiKey: TEST_API_KEY, request }]);
    expect(JSON.stringify(provider.config)).not.toContain(TEST_API_KEY);
  });

  it("passes usage through when the transport reports it", async () => {
    const transport = mockTransport(async () => ({ text: "x", usage: { inputTokens: 3, outputTokens: 4 } }));
    const provider = createModelProvider(validModelEnv(), "summary", { transport });
    await expect(provider.complete(request)).resolves.toMatchObject({ usage: { inputTokens: 3, outputTokens: 4 } });
  });

  it("maps transport failures to upstream_unavailable without the cause", async () => {
    const provider = createModelProvider(validModelEnv(), "summary", {
      transport: mockTransport(async () => {
        throw new Error("socket closed with token abc");
      }),
    });
    const err = await provider.complete(request).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe("upstream_unavailable");
    expect((err as ApiError).message).not.toContain("abc");
  });

  it("treats an empty reply as a failure, not a result", async () => {
    const provider = createModelProvider(validModelEnv(), "summary", {
      transport: mockTransport(async () => ({ text: "  " })),
    });
    await expect(provider.complete(request)).rejects.toMatchObject({ code: "upstream_unavailable" });
  });
});

describe("createModelProvider (workers-ai)", () => {
  const schema = { type: "object", properties: { level: { type: "string" } } };
  const withSchema = { ...request, jsonSchema: schema };

  it("needs the AI binding but not the Meta key", () => {
    const env = { ...validModelEnv() };
    delete env.MODEL_API_KEY;
    expect(() => createModelProvider(env, "risk", { transport: mockTransport() })).toThrow(ConfigError);
    expect(() => createModelProvider(env, "risk", { transport: mockTransport(), ai: fakeAi() })).not.toThrow();
  });

  it("runs the model with system and user messages and a JSON schema, never touching the Meta transport", async () => {
    const ai = fakeAi(async () => ({ response: '{"level":"low"}', usage: { prompt_tokens: 11, completion_tokens: 5 } }));
    const transport = mockTransport();
    const provider = createModelProvider(validModelEnv(), "risk", { transport, ai });
    await expect(provider.complete(withSchema)).resolves.toEqual({
      text: '{"level":"low"}',
      provider: "workers-ai",
      modelId: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      usage: { inputTokens: 11, outputTokens: 5 },
    });
    expect(transport.calls).toHaveLength(0);
    expect(ai.runs).toHaveLength(1);
    expect(ai.runs[0]?.model).toBe("@cf/meta/llama-3.3-70b-instruct-fp8-fast");
    expect(ai.runs[0]?.inputs).toEqual({
      messages: [
        { role: "system", content: "s" },
        { role: "user", content: "p" },
      ],
      max_tokens: 100,
      response_format: { type: "json_schema", json_schema: schema },
    });
  });

  it("serializes a parsed JSON-mode object", async () => {
    const ai = fakeAi(async () => ({ response: { level: "low" } }));
    const provider = createModelProvider(validModelEnv(), "risk", { transport: mockTransport(), ai });
    await expect(provider.complete(withSchema)).resolves.toMatchObject({ text: '{"level":"low"}' });
  });

  it("passes the gateway only when AI_GATEWAY_ID is set", async () => {
    const without = fakeAi();
    await createModelProvider(validModelEnv(), "risk", { transport: mockTransport(), ai: without }).complete(request);
    expect(without.runs[0]?.argCount).toBe(2);
    expect(without.runs[0]?.options).toBeUndefined();

    for (const blank of ["", "  "]) {
      const ai = fakeAi();
      const env = { ...validModelEnv(), AI_GATEWAY_ID: blank };
      await createModelProvider(env, "risk", { transport: mockTransport(), ai }).complete(request);
      expect(ai.runs[0]?.argCount).toBe(2);
    }

    const withGateway = fakeAi();
    const env = { ...validModelEnv(), AI_GATEWAY_ID: "my-gateway" };
    await createModelProvider(env, "risk", { transport: mockTransport(), ai: withGateway }).complete(request);
    expect(withGateway.runs[0]?.options).toEqual({ gateway: { id: "my-gateway" } });
  });

  it("maps thrown errors and the JSON mode failure to upstream_unavailable without the cause", async () => {
    for (const message of ["JSON Mode couldn't be met", "5006: internal secret detail"]) {
      const ai = fakeAi(async () => {
        throw new Error(message);
      });
      const provider = createModelProvider(validModelEnv(), "risk", { transport: mockTransport(), ai });
      const err = await provider.complete(request).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).code).toBe("upstream_unavailable");
      expect((err as ApiError).message).not.toContain("secret detail");
      expect((err as ApiError).message).not.toContain("JSON Mode");
    }
  });

  it("treats a missing or empty response as a failure", async () => {
    for (const reply of [{}, { response: "" }, { response: null }, null]) {
      const provider = createModelProvider(validModelEnv(), "risk", {
        transport: mockTransport(),
        ai: fakeAi(async () => reply),
      });
      await expect(provider.complete(request)).rejects.toMatchObject({ code: "upstream_unavailable" });
    }
  });
});

describe("vision image input", () => {
  const dataUrl = "data:image/png;base64,AAA";
  const withImage = { ...request, image: { dataUrl } };

  it("sends the screenshot as an image part inside the user message", async () => {
    const ai = fakeAi(async () => ({ response: "ok" }));
    const transport = mockTransport();
    const provider = createModelProvider(validModelEnv(), "highlight", { transport, ai });
    await expect(provider.complete(withImage)).resolves.toMatchObject({
      provider: "workers-ai",
      modelId: "@cf/meta/llama-4-scout-17b-16e-instruct",
    });
    expect(transport.calls).toHaveLength(0);
    expect(ai.runs[0]?.inputs).toEqual({
      messages: [
        { role: "system", content: "s" },
        {
          role: "user",
          content: [
            { type: "text", text: "p" },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
      max_tokens: 100,
    });
  });

  it("passes the screenshot to the Meta transport on a highlight route", async () => {
    const transport = mockTransport();
    const provider = createModelProvider({ ...validModelEnv(), MODEL_ROUTE_HIGHLIGHT: "meta:muse-spark-1.2" }, "highlight", { transport });
    await provider.complete(withImage);
    expect(transport.calls[0]?.request.image).toEqual(withImage.image);
  });
});

describe("MM-061 allowlist and profiles", () => {
  const withRoute = (name: keyof Env, value: string): Env => ({ ...validModelEnv(), [name]: value });

  it("keeps the existing muse-spark-1.2 route working", () => {
    expect(resolveRoute(validModelEnv(), "summary").modelId).toBe("muse-spark-1.2");
  });

  it("accepts muse-spark-1.3 for text and highlight", () => {
    expect(resolveRoute(withRoute("MODEL_ROUTE_SUMMARY", "meta:muse-spark-1.3"), "summary").modelId).toBe("muse-spark-1.3");
    expect(resolveRoute(withRoute("MODEL_ROUTE_HIGHLIGHT", "meta:muse-spark-1.3"), "highlight").provider).toBe("meta");
  });

  it("allows sam-3.1 for segmentation only", () => {
    expect(resolveRoute(withRoute("MODEL_ROUTE_SEGMENT", "meta:sam-3.1"), "segment").modelId).toBe("sam-3.1");
    for (const [name, task] of [["MODEL_ROUTE_SUMMARY", "summary"], ["MODEL_ROUTE_HIGHLIGHT", "highlight"], ["MODEL_ROUTE_DECISION", "decision"]] as const) {
      expect(configError(() => resolveRoute(withRoute(name, "meta:sam-3.1"), task)).detail).toBe(`${name} is not an allowed route`);
    }
  });

  it("allows Clef for decisions only", () => {
    for (const id of ["@cf/cloudflare/clef", "@cf/cloudflare/clef-flash"]) {
      expect(resolveRoute(withRoute("MODEL_ROUTE_DECISION", `workers-ai:${id}`), "decision").modelId).toBe(id);
      expect(configError(() => resolveRoute(withRoute("MODEL_ROUTE_SUMMARY", `workers-ai:${id}`), "summary")).detail).toBe("MODEL_ROUTE_SUMMARY is not an allowed route");
      expect(configError(() => resolveRoute(withRoute("MODEL_ROUTE_HIGHLIGHT", `workers-ai:${id}`), "highlight")).code).toBe("misconfigured");
    }
  });

  it.each(["meta:clef", "workers-ai:@cf/cloudflare/clef-pro", "workers-ai:@cf/other/clef"])("rejects unlisted decision route %s", (value) => {
    expect(configError(() => resolveRoute(withRoute("MODEL_ROUTE_DECISION", value), "decision")).detail).toBe("MODEL_ROUTE_DECISION is not an allowed route");
  });

  it("defaults AI_PROFILE to hackathon and rejects other values", () => {
    expect(resolveAiProfile(validModelEnv())).toBe("hackathon");
    expect(resolveAiProfile({ ...validModelEnv(), AI_PROFILE: "prod" })).toBe("prod");
    expect(resolveAiProfile({ ...validModelEnv(), AI_PROFILE: "hackathon" })).toBe("hackathon");
    expect(configError(() => resolveAiProfile({ ...validModelEnv(), AI_PROFILE: "staging" })).detail).toBe("AI_PROFILE is not hackathon or prod");
  });

  it("gives decisions a clef-flash default only in the prod profile", () => {
    expect(configError(() => resolveRoute(validModelEnv(), "decision")).detail).toBe("MODEL_ROUTE_DECISION is not set");
    expect(resolveRoute({ ...validModelEnv(), AI_PROFILE: "prod" }, "decision").modelId).toBe("@cf/cloudflare/clef-flash");
    // An explicit route wins over the profile default.
    expect(resolveRoute({ ...validModelEnv(), AI_PROFILE: "prod", MODEL_ROUTE_DECISION: "workers-ai:@cf/cloudflare/clef" }, "decision").modelId).toBe("@cf/cloudflare/clef");
    // The profile never supplies text routes.
    expect(configError(() => resolveRoute({ AI_PROFILE: "prod" }, "summary")).detail).toBe("MODEL_ROUTE_SUMMARY is not set");
  });
});

describe("createDecisionProvider / completeDecision", () => {
  const env: Env = { ...validModelEnv(), MODEL_ROUTE_DECISION: "workers-ai:@cf/cloudflare/clef-flash", AI_GATEWAY_ID: "gw" };
  const questions = [
    { id: "look", type: "noul", question: "Needs a closer look?" },
    { id: "lane", type: "choice", question: "Which lane?", options: ["needs_you", "fyi", "ignore"] },
    { id: "risk", type: "score", question: "Risk?", levels: 3 },
  ] as const;
  const good = {
    response: {
      answers: [
        { id: "look", probabilities: { true: 0.8, false: 0.2 } },
        { id: "lane", probabilities: { needs_you: 0.6, fyi: 0.3, ignore: 0.1 } },
        { id: "risk", probabilities: { "1": 0.1, "2": 0.2, "3": 0.7 } },
      ],
    },
  };

  it("sends state and typed questions to the Clef model and normalizes the probabilities", async () => {
    const ai = fakeAi(async () => good);
    const result = await createDecisionProvider(env, { ai }).completeDecision({ state: "pr state", questions });
    expect(ai.runs).toHaveLength(1);
    expect(ai.runs[0]?.model).toBe("@cf/cloudflare/clef-flash");
    expect(ai.runs[0]?.options).toEqual({ gateway: { id: "gw" } });
    expect(ai.runs[0]?.inputs).toEqual({
      state: "pr state",
      questions: [
        { id: "look", type: "noul", question: "Needs a closer look?" },
        { id: "lane", type: "choice", question: "Which lane?", options: ["needs_you", "fyi", "ignore"] },
        { id: "risk", type: "score", question: "Risk?", levels: 3 },
      ],
    });
    expect(result.provider).toBe("workers-ai");
    expect(result.modelId).toBe("@cf/cloudflare/clef-flash");
    expect(result.answers.map((a) => [a.id, a.top])).toEqual([["look", "yes"], ["lane", "needs_you"], ["risk", "3"]]);
    expect(result.answers[0]?.probabilities).toEqual({ yes: 0.8, no: 0.2 });
  });

  it("accepts a bare probability for a noul question", async () => {
    const ai = fakeAi(async () => ({ answers: { look: 0.25 } }));
    const result = await createDecisionProvider(env, { ai }).completeDecision({ state: "s", questions: [questions[0]] });
    expect(result.answers[0]).toEqual({ id: "look", probabilities: { yes: 0.25, no: 0.75 }, top: "no" });
  });

  it.each([
    ["a missing answer", { answers: [] }],
    ["an unlisted option only", { answers: [{ id: "look", probabilities: { maybe: 1 } }] }],
    ["a probability above 1", { answers: [{ id: "look", probabilities: { yes: 2, no: 0 } }] }],
    ["a non-number", { answers: [{ id: "look", probabilities: { yes: "x", no: 0 } }] }],
    ["an empty reply", null],
  ])("fails closed on %s", async (_name, reply) => {
    const ai = fakeAi(async () => reply);
    await expect(createDecisionProvider(env, { ai }).completeDecision({ state: "s", questions: [questions[0]] })).rejects.toMatchObject({ code: "upstream_unavailable" });
  });

  it("maps a binding failure to upstream_unavailable without request content in the detail", async () => {
    const ai = fakeAi(async () => {
      throw new Error("boom");
    });
    const err = await createDecisionProvider(env, { ai }).completeDecision({ state: "SECRET-STATE", questions: [questions[0]] }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(JSON.stringify([(err as ApiError).message, (err as ApiError).logDetail])).not.toContain("SECRET-STATE");
  });

  it("rejects no questions, too many questions, and oversized state before any call", async () => {
    const ai = fakeAi(async () => good);
    const p = createDecisionProvider(env, { ai });
    await expect(p.completeDecision({ state: "s", questions: [] })).rejects.toMatchObject({ code: "validation_failed" });
    await expect(p.completeDecision({ state: "s", questions: Array.from({ length: 65 }, (_, i) => ({ id: `q${i}`, type: "noul", question: "?" })) })).rejects.toMatchObject({ code: "validation_failed" });
    await expect(p.completeDecision({ state: "x".repeat(150_001), questions: [questions[0]] })).rejects.toMatchObject({ code: "validation_failed" });
    expect(ai.runs).toHaveLength(0);
  });

  it("needs the AI binding and a decision route, and the text path refuses a decision task", () => {
    expect(() => createDecisionProvider(env, {})).toThrow(ConfigError);
    expect(() => createDecisionProvider(validModelEnv(), { ai: fakeAi() })).toThrow(ConfigError);
    expect(() => createModelProvider(env, "decision", { transport: mockTransport(), ai: fakeAi() })).toThrow(ConfigError);
  });

  it("uses the prod profile default when no decision route is set", () => {
    const provider = createDecisionProvider({ ...validModelEnv(), AI_PROFILE: "prod" }, { ai: fakeAi() });
    expect(provider.config.modelId).toBe("@cf/cloudflare/clef-flash");
  });
});
