import { z } from "zod";
import { ApiClientError, messageForCode } from "./errors";

/** Where the session token lives on native. Web never has one: its session is an HttpOnly cookie. */
export interface TokenStore {
  get(): Promise<string | null>;
  set(token: string): Promise<void>;
  clear(): Promise<void>;
}

export interface HttpApiClientOptions {
  /** API origin without a path, e.g. `http://localhost:8787`. */
  baseUrl: string;
  /** `web` uses the cookie and CSRF token; `native` uses the bearer token. */
  platform: "web" | "native";
  nativePlatform?: "ios" | "android";
  onAccountDeleted?:()=>Promise<void>;
  tokenStore: TokenStore;
  fetch?: typeof fetch;
  timeoutMs?: number;
  /** Returns a Turnstile token for the demo and the support form. Throws when no bot check is available. */
  getTurnstileToken?: () => Promise<string>;
}

export interface RequestOptions<T> {
  signal?:AbortSignal;
  credentials?: "omit";
  method?: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  body?: unknown;
  form?: FormData;
  audio?:ArrayBuffer;
  /** Parse the JSON body with this schema. Leave out for empty (204) answers. */
  schema?: z.ZodType<T>;
  /** Public endpoints skip the session. Default true. */
  auth?: boolean;
  /** A probe never raises the "session expired" handler (used to check whether anyone is signed in). */
  probe?: boolean;
  timeoutMs?: number;
  /** The session refresh itself must not wait for the refresh it is part of. */
  isRefresh?: boolean;
  sessionMutation?: boolean;
  allowStaleSession?: boolean;
  sessionGeneration?: number;
}

export const DEFAULT_TIMEOUT_MS = 30_000;
export const AI_TIMEOUT_MS = 60_000;

export const SAFE_METHODS = new Set(["GET", "HEAD"]);

export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const stamp = Date.parse(value);
  return Number.isFinite(stamp) ? Math.max(0, Math.ceil((stamp-now)/1000)) : undefined;
}

export const enc = encodeURIComponent;

export function prPath(owner: string, repo: string, number: number): string {
  if (!Number.isInteger(number) || number < 1) {
    throw new ApiClientError("validation_failed", messageForCode("validation_failed"));
  }
  return `/prs/${enc(owner)}/${enc(repo)}/${number}`;
}
