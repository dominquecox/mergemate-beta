/** Minimal shape of a Workers Rate Limiting binding. */
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/** Worker bindings. Non-secret values come from wrangler.toml [vars]; secrets from `wrangler secret put`. */
export interface Env {
  MODEL_PROVIDER?: string;
  MODEL_ID?: string;
  MODEL_BASE_URL?: string;
  MODEL_API_KEY?: string;
  IP_RATE_LIMITER?: RateLimiter;
}

export interface Variables {
  requestId: string;
}

export interface AppEnv {
  Bindings: Env;
  Variables: Variables;
}
