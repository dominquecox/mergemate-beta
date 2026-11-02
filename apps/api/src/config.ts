import type { Env } from "./env";
import { ConfigError } from "./errors";

type AppEnvName = "development" | "production";
export type Platform = import("@mergemate/contracts").Platform;

// Fixed allowlists. Config picks among these; it can never add an origin or callback.
const WEB_ORIGINS: Record<AppEnvName, readonly string[]> = {
  development: ["https://dev.mergemate.dev", "http://localhost:8081"],
  production: ["https://app.mergemate.dev"],
};

// Public site origin, used for post and RSS links. Not a web app origin, so it is never a CORS or auth origin.
const SITE_ORIGINS: Record<AppEnvName, readonly string[]> = {
  development: ["https://dev.mergemate.dev"],
  production: ["https://mergemate.dev"],
};

// Native apps return through verified HTTPS Universal/App Links, never a custom scheme.
const IOS_CALLBACKS: Record<AppEnvName, string> = {
  development: "https://dev.mergemate.dev/auth/callback",
  production: "https://app.mergemate.dev/auth/callback",
};

export const appEnv = (env: Env): AppEnvName => {
  const value = env.APP_ENV?.trim();
  if (value === "development" || value === "production") return value;
  throw new ConfigError(value ? "APP_ENV is not supported" : "APP_ENV is not set");
};

export const corsOrigins = (env: Env) => WEB_ORIGINS[appEnv(env)];

/** The web app's origin for this deployment, checked against the allowlist. */
export const webOrigin = (env: Env) => {
  const origin = env.WEB_ORIGIN?.trim();
  if (!origin) throw new ConfigError("WEB_ORIGIN is not set");
  if (!WEB_ORIGINS[appEnv(env)].includes(origin)) throw new ConfigError("WEB_ORIGIN is not allowed for APP_ENV");
  return origin;
};

/** Origins Stripe Checkout and Portal may return to: the same fixed list as the web app origins. */
export const billingReturnOrigins = (env: Env) => WEB_ORIGINS[appEnv(env)];

/** The public site's origin for post and RSS links, checked against its own allowlist. */
export const siteOrigin = (env: Env) => {
  const origin = env.SITE_ORIGIN?.trim();
  if (!origin) throw new ConfigError("SITE_ORIGIN is not set");
  if (!SITE_ORIGINS[appEnv(env)].includes(origin)) throw new ConfigError("SITE_ORIGIN is not allowed for APP_ENV");
  return origin;
};

export const callbackUrl = (env: Env, platform: Platform) =>
  platform === "web" ? `${webOrigin(env)}/auth/callback` : `${IOS_CALLBACKS[appEnv(env)]}?native=1`;

export const requireVar = (
  env: Env,
  name:
    | "GITHUB_APP_CLIENT_ID"
    | "GITHUB_APP_CLIENT_SECRET"
    | "GITHUB_APP_SLUG"
    | "TURNSTILE_SECRET_KEY"
    | "RESEND_API_KEY"
    | "EMAIL_FROM"
    | "SUPPORT_EMAIL",
) => {
  const value = env[name]?.trim();
  if (!value) throw new ConfigError(`${name} is not set`);
  return value;
};

export const requireBinding = <
  K extends "DB" | "RATE_ADMISSION" | "TOKEN_REFRESHER" | "TELEMETRY" | "POSTS" | "GITHUB_EVENTS",
>(
  env: Env,
  name: K,
): NonNullable<Env[K]> => {
  const binding = env[name];
  if (!binding) throw new ConfigError(`${name} binding is missing`);
  return binding;
};
