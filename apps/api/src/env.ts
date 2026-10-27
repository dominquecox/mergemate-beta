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

/** Minimal shape of the Workers AI binding. */
export interface AiBinding {
  run(model: string, inputs: unknown, options?: { gateway?: { id: string } }): Promise<unknown>;
}

/** Worker bindings. Non-secret values come from wrangler.toml [vars]; secrets from `wrangler secret put`. */
export interface Env {
  APP_ENV?: string;
  WEB_ORIGIN?: string;
  SITE_ORIGIN?: string;
  /** Per-task model routes, each `provider:model` from the allowlist in ai/routes.ts. */
  MODEL_ROUTE_SUMMARY?: string;
  MODEL_ROUTE_RISK?: string;
  MODEL_ROUTE_TRIAGE?: string;
  AI_DAILY_TRIAGE_FREE?: string;
  AI_DAILY_TRIAGE_PRO?: string;
  MODEL_ROUTE_HIGHLIGHT?: string;
  MODEL_BASE_URL?: string;
  MODEL_API_KEY?: string;
  /** AI Gateway id for Workers AI calls (not a secret). Absent means calls go without a gateway. */
  AI_GATEWAY_ID?: string;
  /** Daily AI actions per user on the free plan. Defaults to 30. */
  AI_DAILY_ACTIONS_FREE?: string;
  /** Daily AI actions per user on the paid plan. Defaults to 500. */
  AI_DAILY_ACTIONS_PRO?: string;
  /** Global daily AI actions. Absent means unenforced. */
  AI_GLOBAL_DAILY_ACTIONS?: string;
  GITHUB_APP_CLIENT_ID?: string;
  GITHUB_APP_CLIENT_SECRET?: string;
  GITHUB_APP_SLUG?: string;
  GITHUB_WEBHOOK_SECRET?: string;
  GITHUB_WEBHOOK_SECRET_NEXT?: string;
  TOKEN_ENCRYPTION_KEY?: string;
  TOKEN_ENCRYPTION_KEY_PREVIOUS?: string;
  TURNSTILE_SECRET_KEY?: string;
  EXPO_ACCESS_TOKEN?: string;
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
  /** One content-free data point per model call. Metering is skipped when absent. */
  AI_METRICS?: AnalyticsEngineDataset;
  AI?: AiBinding;
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
