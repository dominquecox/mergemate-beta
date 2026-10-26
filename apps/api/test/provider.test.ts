import { describe, expect, it } from "vitest";
import { createModelProvider, resolveModelConfig } from "../src/ai/provider";
import type { Env } from "../src/env";
import { ApiError, ConfigError } from "../src/errors";
import { mockTransport, TEST_API_KEY, validModelEnv } from "./helpers";

const request = { system: "s", prompt: "p", maxOutputTokens: 100 };

const configError = (env: Env) => {
  try {
    resolveModelConfig(env);
  } catch (err) {
    if (err instanceof ConfigError) return err;
    throw err;
  }
  throw new Error("expected a ConfigError");
};

describe("resolveModelConfig", () => {
  it("reads provider, model and base URL from env", () => {
    expect(resolveModelConfig(validModelEnv())).toEqual({
      provider: "meta",
      modelId: "muse-spark-1.2",
      baseUrl: "https://api.meta.ai/v1",
    });
  });

  it.each(["MODEL_PROVIDER", "MODEL_ID", "MODEL_BASE_URL"] as const)("throws when %s is missing", (name) => {
    const env = { ...validModelEnv(), [name]: "  " };
    const err = configError(env);
    expect(err.code).toBe("misconfigured");
    expect(err.detail).toBe(`${name} is not set`);
  });

  it("rejects providers other than meta with no fallback", () => {
    expect(configError({ ...validModelEnv(), MODEL_PROVIDER: "baseten" }).detail).toBe(
      "MODEL_PROVIDER is not supported",
    );
  });

  it("rejects contributor models", () => {
    expect(configError({ ...validModelEnv(), MODEL_ID: "muse-spark-1.2-contributor" }).detail).toBe(
      "MODEL_ID must not be a contributor model",
    );
  });

  it("rejects malformed model ids", () => {
    expect(configError({ ...validModelEnv(), MODEL_ID: "Muse Spark" }).detail).toBe(
      "MODEL_ID is not a valid model id",
    );
  });

  it.each([
    ["not a url", "MODEL_BASE_URL is not a valid URL"],
    ["http://api.meta.ai/v1", "MODEL_BASE_URL must use https"],
    ["https://user:pw@api.meta.ai/v1", "MODEL_BASE_URL must not carry credentials, query or fragment"],
    ["https://api.meta.ai/v1?key=x", "MODEL_BASE_URL must not carry credentials, query or fragment"],
  ])("rejects base URL %s", (value, detail) => {
    expect(configError({ ...validModelEnv(), MODEL_BASE_URL: value }).detail).toBe(detail);
  });

  it("never puts configured values in the error", () => {
    const err = configError({ ...validModelEnv(), MODEL_PROVIDER: "secret-ish-value" });
    expect(err.message).not.toContain("secret-ish-value");
    expect(err.detail).not.toContain("secret-ish-value");
  });
});

describe("createModelProvider", () => {
  it("throws before any call when the API key is missing", () => {
    const transport = mockTransport();
    const env = { ...validModelEnv() };
    delete env.MODEL_API_KEY;
    expect(() => createModelProvider(env, transport)).toThrow(ConfigError);
    expect(transport.calls).toHaveLength(0);
  });

  it("calls the transport with the resolved config and returns the model used", async () => {
    const transport = mockTransport();
    const provider = createModelProvider(validModelEnv(), transport);
    await expect(provider.complete(request)).resolves.toEqual({
      text: "mock reply",
      provider: "meta",
      modelId: "muse-spark-1.2",
    });
    expect(transport.calls).toEqual([{ config: provider.config, apiKey: TEST_API_KEY, request }]);
    expect(JSON.stringify(provider.config)).not.toContain(TEST_API_KEY);
  });

  it("maps transport failures to upstream_unavailable without the cause", async () => {
    const provider = createModelProvider(
      validModelEnv(),
      mockTransport(async () => {
        throw new Error("socket closed with token abc");
      }),
    );
    const err = await provider.complete(request).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe("upstream_unavailable");
    expect((err as ApiError).message).not.toContain("abc");
  });

  it("treats an empty reply as a failure, not a result", async () => {
    const provider = createModelProvider(validModelEnv(), mockTransport(async () => ({ text: "  " })));
    await expect(provider.complete(request)).rejects.toMatchObject({ code: "upstream_unavailable" });
  });
});
