import { afterEach, describe, expect, it, vi } from "vitest";
import { createFetchTransport } from "../src/routes/ai-engine";
import { UpstreamStatusError, createModelProvider, withUserOwnedKey } from "../src/ai/provider";
import { githubGet } from "../src/lib/github";
import { ApiError, ConfigError } from "../src/errors";
import type { Deps, Env } from "../src/env";
import { fakeAi, mockTransport, validModelEnv } from "./helpers";

const META = { provider: "meta" as const, modelId: "muse-spark-1.2", maxInputChars: 190_000, baseUrl: "https://api.meta.ai/v1" };
const REQUEST = { system: "s", prompt: "SECRET-PROMPT-FIXTURE", maxOutputTokens: 10 };
const OK_BODY = JSON.stringify({ object: "response", status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "hi" }] }] });

/** A fetch that answers with the given statuses in order and records whether each body was released. */
const stubFetch = (statuses: number[]) => {
  const calls: { init: RequestInit; cancelled: () => boolean }[] = [];
  const fn = (async (_url: string, init: RequestInit) => {
    const status = statuses[Math.min(calls.length, statuses.length - 1)] ?? 200;
    let cancelled = false;
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(status === 200 ? OK_BODY : "{\"error\":\"PRIVATE-BODY-FIXTURE\"}"));
        controller.close();
      },
      cancel() {
        cancelled = true;
      },
    });
    calls.push({ init, cancelled: () => cancelled });
    return new Response(body, { status });
  }) as unknown as typeof fetch;
  return { fn, calls };
};

afterEach(() => vi.restoreAllMocks());

describe("model transport: retries and deadline", () => {
  it.each([401, 403])("never retries a rejected key (%s)", async (status) => {
    const { fn, calls } = stubFetch([status, 200]);
    const error = await createFetchTransport(fn).complete({ config: META, apiKey: "k", request: REQUEST }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UpstreamStatusError);
    expect((error as UpstreamStatusError).status).toBe(status);
    expect(calls).toHaveLength(1);
  });

  it("retries a 429 once and releases the first response body", async () => {
    const { fn, calls } = stubFetch([429, 200]);
    await expect(createFetchTransport(fn).complete({ config: META, apiKey: "k", request: REQUEST })).resolves.toEqual({ text: "hi" });
    expect(calls).toHaveLength(2);
    expect(calls[0]?.cancelled()).toBe(true);
  });

  it("gives up after two 5xx answers with the status only", async () => {
    const { fn, calls } = stubFetch([503, 502]);
    const error = await createFetchTransport(fn).complete({ config: META, apiKey: "k", request: REQUEST }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UpstreamStatusError);
    expect(String(error)).not.toContain("PRIVATE-BODY-FIXTURE");
    expect(calls).toHaveLength(2);
    expect(calls.every((call) => call.cancelled())).toBe(true);
  });

  it("uses one deadline for both attempts", async () => {
    const { fn, calls } = stubFetch([500, 200]);
    await createFetchTransport(fn).complete({ config: META, apiKey: "k", request: REQUEST });
    expect(calls[0]?.init.signal).toBeInstanceOf(AbortSignal);
    expect(calls[1]?.init.signal).toBe(calls[0]?.init.signal);
  });

  it("does not retry when the deadline is nearly used up", async () => {
    const start = Date.now();
    const now = vi.spyOn(Date, "now").mockReturnValue(start);
    const { fn, calls } = stubFetch([503, 200]);
    const slow = (async (url: string, init: RequestInit) => {
      const res = await fn(url, init);
      now.mockReturnValue(start + 45_000); // the first answer took 45 s
      return res;
    }) as unknown as typeof fetch;
    await expect(createFetchTransport(slow).complete({ config: META, apiKey: "k", request: REQUEST })).rejects.toBeInstanceOf(UpstreamStatusError);
    expect(calls).toHaveLength(1);
  });
});

describe("model provider: what a failure means", () => {
  const env = (): Env => ({ ...validModelEnv(), MODEL_ROUTE_SUMMARY: "meta:muse-spark-1.2" });
  const rejecting = (status: number) => mockTransport(async () => { throw new UpstreamStatusError(status); });

  it("reports MergeMate's own rejected key as a setup problem, naming the setting but not the key", async () => {
    const provider = createModelProvider(env(), "summary", { transport: rejecting(401) });
    const error = await provider.complete(REQUEST).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConfigError);
    expect((error as ConfigError).code).toBe("misconfigured");
    expect((error as ConfigError).detail).toBe("MODEL_API_KEY rejected by meta (401)");
    expect(JSON.stringify(error)).not.toContain(env().MODEL_API_KEY ?? "no key");
  });

  it("tells a person their own saved key was rejected", async () => {
    const provider = createModelProvider(withUserOwnedKey(env(), "user-key-fixture"), "summary", { transport: rejecting(403) });
    const error = await provider.complete(REQUEST).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("forbidden");
    expect((error as ApiError).message).toBe("Meta rejected your saved key. Replace or remove it in web Settings.");
    expect(JSON.stringify([error, (error as ApiError).logDetail])).not.toContain("user-key-fixture");
  });

  it("keeps an outage an outage, with a log-only detail and no request content", async () => {
    const provider = createModelProvider(env(), "summary", { transport: rejecting(503) });
    const error = await provider.complete(REQUEST).catch((e: unknown) => e);
    expect((error as ApiError).code).toBe("upstream_unavailable");
    expect((error as ApiError).logDetail).toBe("meta:muse-spark-1.2 UpstreamStatusError: upstream status 503");
    expect(JSON.stringify([error, (error as ApiError).logDetail])).not.toContain("SECRET-PROMPT-FIXTURE");
  });

  it("names a timeout in the log detail", async () => {
    const timeout = mockTransport(async () => { throw new DOMException("The operation timed out.", "TimeoutError"); });
    const error = await createModelProvider(env(), "summary", { transport: timeout }).complete(REQUEST).catch((e: unknown) => e);
    expect((error as ApiError).logDetail).toContain("TimeoutError");
  });

  it("automatically fails over to Workers AI Llama when Meta encounters an upstream outage", async () => {
    const ai = fakeAi(async () => ({ response: '{"fallback":true}' }));
    const provider = createModelProvider(env(), "summary", { transport: rejecting(503), ai });
    const result = await provider.complete(REQUEST);
    expect(result.text).toBe('{"fallback":true}');
    expect(result.provider).toBe("workers-ai");
    expect(result.modelId).toBe("@cf/meta/llama-3.3-70b-instruct-fp8-fast");
    expect(ai.runs).toHaveLength(1);
  });
});

describe("GitHub reads: retries and log detail", () => {
  const deps = (fetchImpl: typeof fetch): Deps => ({ fetch: fetchImpl, now: () => new Date() }) as unknown as Deps;

  it("releases a failed response before the one retry", async () => {
    const { fn, calls } = stubFetch([502, 200]);
    const json = (async (url: string, init: RequestInit) => {
      const res = await fn(url, init);
      return res.status === 200 ? new Response("{\"ok\":true}", { status: 200 }) : res;
    }) as unknown as typeof fetch;
    await expect(githubGet(deps(json), "token-fixture", "/user")).resolves.toEqual({ ok: true });
    expect(calls).toHaveLength(2);
    expect(calls[0]?.cancelled()).toBe(true);
  });

  it("tells a timeout from a network failure, without the path or token", async () => {
    const timeout = (async () => { throw new DOMException("timed out", "TimeoutError"); }) as unknown as typeof fetch;
    const offline = (async () => { throw new TypeError("network down"); }) as unknown as typeof fetch;
    const failure = async (run: Promise<unknown>): Promise<ApiError> => {
      try {
        await run;
      } catch (error) {
        if (error instanceof ApiError) return error;
        throw error;
      }
      throw new Error("expected an ApiError");
    };
    const first = await failure(githubGet(deps(timeout), "token-fixture", "/repos/acme/private"));
    const second = await failure(githubGet(deps(offline), "token-fixture", "/repos/acme/private"));
    expect([first.logDetail, second.logDetail]).toEqual(["github api timeout", "github api fetch failed"]);
    expect(JSON.stringify([first, second, first.logDetail, second.logDetail])).not.toMatch(/token-fixture|acme\/private/);
  });
});
