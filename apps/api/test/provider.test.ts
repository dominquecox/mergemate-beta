import { describe, expect, it } from "vitest";
import { createModelProvider, resolveModelConfig } from "../src/ai/provider";
import { resolveRoute } from "../src/ai/routes";
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
