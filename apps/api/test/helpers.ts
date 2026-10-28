import type { AdmissionNamespace, AdmissionScope } from "../src/rate-policy";
import type { AiBinding, Deps, Env, RefreshOutcome } from "../src/env";
import type { ModelTransport } from "../src/ai/provider";
import { refreshTokens } from "../src/lib/github-tokens";
import { TestD1 } from "./d1";

export interface RateLimiter { limit(options:{key:string}):Promise<{success:boolean}> }
export type FixtureLimiters = { IP_RATE_LIMITER:RateLimiter;SESSION_RATE_LIMITER:RateLimiter;SUPPORT_RATE_LIMITER:RateLimiter };
export const fakeAdmissionNamespace = (lookup:(scope:AdmissionScope)=>RateLimiter|undefined):AdmissionNamespace => ({
  getByName(name) { return { async admit(scope) {
    const limiter=lookup(scope);if(!limiter)throw new Error('Fixture admission unavailable');
    const {success}=await limiter.limit({key:name});return {success,retryAfter:success?0:60};
  } }; },
});

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

// Placeholders only; never real keys.
export const TEST_API_KEY = "test-key-not-real";
const testEncryptionKey = (version: string) =>
  `${version}:${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64")}`;

export const validModelEnv = (): Env => ({
  MODEL_ROUTE_SUMMARY: "meta:muse-spark-1.2",
  MODEL_ROUTE_RISK: "workers-ai:@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  MODEL_ROUTE_TRIAGE: "workers-ai:@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  MODEL_ROUTE_HIGHLIGHT: "workers-ai:@cf/meta/llama-4-scout-17b-16e-instruct",
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

export interface AiRun {
  model: string;
  inputs: unknown;
  options: unknown;
  argCount: number;
}

/** Fake Workers AI binding: records calls and returns a canned reply. No real AI calls. */
export const fakeAi = (
  reply: (run: AiRun) => Promise<unknown> = async () => ({ response: "{}" }),
): AiBinding & { runs: AiRun[] } => {
  const runs: AiRun[] = [];
  return {
    runs,
    run(...args: Parameters<AiBinding["run"]>) {
      const run: AiRun = { model: args[0], inputs: args[1], options: args[2], argCount: args.length };
      runs.push(run);
      return reply(run);
    },
  };
};

/** Fake Analytics Engine dataset: records data points. */
export const fakeDataset = (fail = false) => {
  const points: { blobs?: unknown[]; doubles?: number[]; indexes?: unknown[] }[] = [];
  return {
    points,
    writeDataPoint(point?: { blobs?: unknown[]; doubles?: number[]; indexes?: unknown[] }) {
      if (fail) throw new Error("metrics down");
      points.push(point ?? {});
    },
  } as AnalyticsEngineDataset & { points: typeof points };
};

export interface RecordedCall {
  method: string;
  url: string;
  headers: Headers;
  body: string | null;
}

type Handler = (call: RecordedCall) => Response | Promise<Response>;

/**
 * Fake network. Routes are "METHOD url-prefix". Unmatched calls fail the test, and any
 * non-GET to the GitHub REST API other than the grant revocation is rejected outright.
 */
export const fakeNetwork = () => {
  const routes: [string, string, Handler][] = [];
  const calls: RecordedCall[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    const call: RecordedCall = {
      method,
      url,
      headers: new Headers(init?.headers),
      body: typeof init?.body === "string" ? init.body : null,
    };
    calls.push(call);
    if (url.startsWith("https://api.github.com/") && method !== "GET" && !/\/applications\/[^/]+\/grant$/.test(url)) {
      throw new Error(`GitHub write attempted: ${method} ${url}`);
    }
    const match = routes.find(([m, prefix]) => m === method && url.startsWith(prefix));
    if (!match) throw new Error(`Unexpected request: ${method} ${url}`);
    return match[2](call);
  };
  return {
    calls,
    fetch: fetcher,
    on(method: string, prefix: string, handler: Handler | unknown) {
      routes.unshift([
        method,
        prefix,
        typeof handler === "function" ? (handler as Handler) : () => json(handler),
      ]);
      return this;
    },
  };
};

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

export const clock = (start = "2026-10-27T12:00:00Z") => {
  let now = Date.parse(start);
  return {
    now: () => new Date(now),
    advance(ms: number) {
      now += ms;
    },
  };
};

export interface TestContext {
  env: Env & FixtureLimiters & { DB: D1Database };
  db: TestD1;
  net: ReturnType<typeof fakeNetwork>;
  time: ReturnType<typeof clock>;
  deps: Deps;
  ipLimiter: ReturnType<typeof fakeLimiter>;
  sessionLimiter: ReturnType<typeof fakeLimiter>;
  refreshCalls: string[];
  points: AnalyticsEngineDataPoint[];
  kv: Map<string, string>;
  queued: unknown[];
  supportLimiter: ReturnType<typeof fakeLimiter>;
}

/** A full test environment: real migrations, fake GitHub, serialized fake token refresher. */
export const testContext = (overrides: Partial<Env & FixtureLimiters> = {}): TestContext => {
  const db = new TestD1();
  const net = fakeNetwork();
  const time = clock();
  const deps: Deps = { fetch: net.fetch, now: time.now };
  const ipLimiter = fakeLimiter();
  const sessionLimiter = fakeLimiter();
  const refreshCalls: string[] = [];
  const points: AnalyticsEngineDataPoint[] = [];
  const kv = new Map<string, string>();
  const queued: unknown[] = [];
  const supportLimiter = fakeLimiter();
  let queue: Promise<unknown> = Promise.resolve();

  const env: TestContext["env"] = {
    APP_ENV: "development",
    WEB_ORIGIN: "http://localhost:8081",
    SITE_ORIGIN: "https://dev.mergemate.dev",
    GITHUB_APP_CLIENT_ID: "Iv-test-client",
    GITHUB_APP_CLIENT_SECRET: "test-secret-not-real",
    GITHUB_APP_SLUG: "mergemate-test",
    TOKEN_ENCRYPTION_KEY: testEncryptionKey("2"),
    TURNSTILE_SECRET_KEY: "test-turnstile-not-real",
    DB: db as unknown as D1Database,
    RATE_ADMISSION: fakeAdmissionNamespace(scope=>scope==='ip'?env.IP_RATE_LIMITER:scope==='session'?env.SESSION_RATE_LIMITER:env.SUPPORT_RATE_LIMITER),
    IP_RATE_LIMITER: ipLimiter,
    SESSION_RATE_LIMITER: sessionLimiter,
    TOKEN_REFRESHER: {
      idFromName: (name: string) => ({ toString: () => name }) as DurableObjectId,
      get: () => ({
        // Same guarantee as the Durable Object: one refresh at a time.
        refresh(userId: string) {
          const run = queue.then(() => {
            refreshCalls.push(userId);
            return refreshTokens(env, deps, userId);
          });
          queue = run.catch(() => undefined);
          return run as Promise<RefreshOutcome>;
        },
      }),
    },
    TELEMETRY: { writeDataPoint: (point?: AnalyticsEngineDataPoint) => void (point && points.push(point)) },
    GITHUB_WEBHOOK_SECRET: "test-webhook-secret-not-real",
    RESEND_API_KEY: "test-resend-not-real",
    EMAIL_FROM: "MergeMate <noreply@example.test>",
    SUPPORT_EMAIL: "support@example.test",
    SUPPORT_RATE_LIMITER: supportLimiter,
    POSTS: {
      get: async (key: string, type?: string) => {
        const value = kv.get(key);
        if (value === undefined) return null;
        return type === "json" ? JSON.parse(value) : value;
      },
    } as unknown as KVNamespace,
    GITHUB_EVENTS: {
      send: async (message: unknown) => {
        queued.push(message);
      },
    },
    ...overrides,
  } as TestContext["env"];

  return { env, db, net, time, deps, ipLimiter, sessionLimiter, refreshCalls, points, kv, queued, supportLimiter };
};

export { testEncryptionKey };
