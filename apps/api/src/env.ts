import type { GitHubEventMessage } from "./lib/github-webhooks";
import type { SessionRecord } from "./lib/sessions";

/** Minimal shape of a Workers Rate Limiting binding. */
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export type RefreshOutcome = "ok" | "reauth" | "unavailable";

/** The per-user Durable Object that serializes GitHub token refreshes. */
export interface TokenRefresherNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): { refresh(userId: string): Promise<RefreshOutcome> };
}

/** Worker bindings. Non-secret values come from wrangler.toml [vars]; secrets from `wrangler secret put`. */
export interface Env {
  APP_ENV?: string;
  WEB_ORIGIN?: string;
  MODEL_PROVIDER?: string;
  MODEL_ID?: string;
  MODEL_BASE_URL?: string;
  MODEL_API_KEY?: string;
  GITHUB_APP_CLIENT_ID?: string;
  GITHUB_APP_CLIENT_SECRET?: string;
  GITHUB_APP_SLUG?: string;
  GITHUB_WEBHOOK_SECRET?: string;
  GITHUB_WEBHOOK_SECRET_NEXT?: string;
  TOKEN_ENCRYPTION_KEY?: string;
  TOKEN_ENCRYPTION_KEY_PREVIOUS?: string;
  TURNSTILE_SECRET_KEY?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  SUPPORT_EMAIL?: string;
  STRIPE_MODE?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_PRO_MONTHLY?: string;
  STRIPE_PRICE_PRO_ANNUAL?: string;
  STRIPE_EVENTS?: Pick<Queue<{ eventId: string }>, "send">;
  DB?: D1Database;
  IP_RATE_LIMITER?: RateLimiter;
  SESSION_RATE_LIMITER?: RateLimiter;
  SUPPORT_RATE_LIMITER?: RateLimiter;
  TOKEN_REFRESHER?: TokenRefresherNamespace;
  TELEMETRY?: AnalyticsEngineDataset;
  POSTS?: KVNamespace;
  GITHUB_EVENTS?: Pick<Queue<GitHubEventMessage>, "send">;
}

/** Outside effects, injectable for tests. */
export interface Deps {
  fetch: typeof fetch;
  now: () => Date;
}

export interface Variables {
  requestId: string;
  deps: Deps;
  session: SessionRecord;
}

export interface AppEnv {
  Bindings: Env;
  Variables: Variables;
}
