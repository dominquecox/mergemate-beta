import type { Env, RateLimiter } from "../src/env";
import type { ModelTransport } from "../src/ai/provider";

/** In-memory limiter: allows `max` calls per key. */
export const fakeLimiter = (max = Number.POSITIVE_INFINITY): RateLimiter & { keys: string[] } => {
  const counts = new Map<string, number>();
  const keys: string[] = [];
  return {
    keys,
    async limit({ key }) {
      keys.push(key);
      const n = (counts.get(key) ?? 0) + 1;
      counts.set(key, n);
      return { success: n <= max };
    },
  };
};

// Placeholder only; never a real key.
export const TEST_API_KEY = "test-key-not-real";

export const validModelEnv = (): Env => ({
  MODEL_PROVIDER: "meta",
  MODEL_ID: "muse-spark-1.2",
  MODEL_BASE_URL: "https://api.meta.ai/v1",
  MODEL_API_KEY: TEST_API_KEY,
});

/** Mock transport: records calls and returns a canned reply. No network. */
export const mockTransport = (
  reply: () => Promise<{ text: string }> = async () => ({ text: "mock reply" }),
): ModelTransport & { calls: Parameters<ModelTransport["complete"]>[0][] } => {
  const calls: Parameters<ModelTransport["complete"]>[0][] = [];
  return {
    calls,
    complete(input) {
      calls.push(input);
      return reply();
    },
  };
};
