import type { AdmissionNamespace } from "./rate-policy";
import type { GitHubEventMessage } from "./lib/github-webhooks";
import type { SessionRecord } from "./lib/sessions";

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
  /** Region boxes for Highlight (`meta:sam-3.1`). Unset means segmentation is off. */
  MODEL_ROUTE_SEGMENT?: string;
  /** Typed-question decisions (Clef). Unset falls back to the AI_PROFILE default. */
  MODEL_ROUTE_DECISION?: string;
  /** `hackathon` (default) or `prod`; see ai/routes.ts PROFILE_DEFAULTS. Not a secret. */
  AI_PROFILE?: string;
  MODEL_BASE_URL?: string;
  MODEL_API_KEY?: string;
  /** AI Gateway id for Workers AI calls (not a secret). Absent means calls go without a gateway. */
  AI_GATEWAY_ID?: string;
  /** Daily AI actions per user on the free plan. Defaults to 30. */
  AI_DAILY_ACTIONS_FREE?: string;
  /** Daily AI actions per user on the paid plan. Defaults to 200. */
  AI_DAILY_ACTIONS_PRO?: string;
  /** When set, everyone without their own Meta key shares this one daily pool of actions on the shared key. */
  AI_DEMO_DAILY_ACTIONS?: string;
  /** Global daily AI actions. Absent means unenforced. */
  AI_GLOBAL_DAILY_ACTIONS?: string;
  GITHUB_APP_CLIENT_ID?: string;
  GITHUB_APP_CLIENT_SECRET?: string;
  /** GitHub App identity used only for short-lived, repository-scoped executor tokens. */
  GITHUB_APP_ID?: string;
  GITHUB_APP_PRIVATE_KEY?: string;
  GITHUB_APP_SLUG?: string;
  GITHUB_WEBHOOK_SECRET?: string;
  GITHUB_WEBHOOK_SECRET_NEXT?: string;
  TOKEN_ENCRYPTION_KEY?: string;
  TOKEN_ENCRYPTION_KEY_PREVIOUS?: string;
  TURNSTILE_SECRET_KEY?: string;
  EXPO_ACCESS_TOKEN?: string;
  /** Web Push (VAPID, RFC 8292) key pair: public key in [vars] (unpadded base64url, 65-byte uncompressed point), private scalar as a secret. */
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
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
  RATE_ADMISSION?: AdmissionNamespace;
  TOKEN_REFRESHER?: TokenRefresherNamespace;
  TELEMETRY?: AnalyticsEngineDataset;
  /** One content-free data point per model call. Metering is skipped when absent. */
  AI_METRICS?: AnalyticsEngineDataset;
  /** Non-secret per-env salt for hashing telemetry user indexes. Absent fails closed. */
  TELEMETRY_SALT?: string;
  AI?: AiBinding;
  /** Private R2 bucket holding highlight uploads between receipt and deletion. Absent in tests. */
  HIGHLIGHT_UPLOADS?: R2Bucket;
  /** Image Transformations binding. When present, uploads are resized and re-encoded before analysis. */
  IMAGES?: ImagesBinding;
  POSTS?: KVNamespace;
  WORKFLOW_QUEUE?: Pick<Queue<{ runId: string }>, "send">;
  /** HMAC key used only to validate short-lived, repo-scoped runner credentials. */
  WORKFLOW_RUNNER_SIGNING_KEY?: string;
  /** Exact Cloudflare Access application audience and team origin for /internal validation. */
  CF_ACCESS_AUD?: string;
  CF_ACCESS_TEAM_DOMAIN?: string;
  WORKFLOW_RUNNER_REPOS?: string;
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
