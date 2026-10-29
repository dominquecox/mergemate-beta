import type { ErrorCode } from "@mergemate/contracts";

/** API error codes plus the failures that happen before or after the API answers. */
export type ClientErrorCode =
  | ErrorCode
  | "cancelled"
  | "network"
  | "timeout"
  | "parse_failed"
  | "bot_check_unavailable"
  | "not_configured"
  | "secure_storage_unavailable"
  | "local_cleanup_incomplete";

export interface ClientErrorDetails {
  status?: number;
  retryAfterSeconds?: number;
  requestId?: string;
  /** GitHub single sign-on URL from the `x-sso-url` header, already checked to be https GitHub. */
  ssoUrl?: string;
}

/**
 * Every failure the API client raises. `message` is always plain language that is safe to show:
 * it is never a stack trace, a raw response body or an upstream error string.
 */
export class ApiClientError extends Error {
  override readonly name = "ApiClientError";
  readonly status?: number;
  readonly retryAfterSeconds?: number;
  readonly requestId?: string;
  readonly ssoUrl?: string;

  constructor(
    readonly code: ClientErrorCode,
    message: string,
    details: ClientErrorDetails = {},
  ) {
    super(message);
    this.status = details.status;
    this.retryAfterSeconds = details.retryAfterSeconds;
    this.requestId = details.requestId;
    this.ssoUrl = details.ssoUrl;
  }
}

/** "a minute", "5 minutes", "2 hours". */
export function formatWait(seconds: number): string {
  if (seconds <= 60) return "a minute";
  if (seconds < 3600) return `${Math.ceil(seconds / 60)} minutes`;
  const hours = Math.ceil(seconds / 3600);
  return hours === 1 ? "an hour" : `${hours} hours`;
}

const FIXED_COPY: Record<ClientErrorCode, string> = {
  cancelled: "Request cancelled.",
  unauthorized: "Your session has ended. Sign in again to continue.",
  forbidden: "That isn't available for this account.",
  csrf_invalid: "Your session needs a quick refresh. Try again.",
  consent_required: "Turn on AI to use this. You choose what gets sent.",
  sso_required: "Your organization requires single sign-on. Authorize MergeMate on GitHub, then try again.",
  payload_too_large: "That file is too large.",
  not_found: "We couldn't find that.",
  validation_failed: "That request wasn't valid. Check it and try again.",
  rate_limited: "You've reached a limit for now. Try again in a little while.",
  rate_limit_unavailable: "MergeMate is temporarily unavailable. Please try again shortly.",
  upstream_unavailable: "MergeMate couldn't reach GitHub or the AI service. Try again in a moment.",
  misconfigured: "MergeMate isn't set up correctly on our side yet. Try again later.",
  internal: "Something went wrong on our side. Try again.",
  network: "You appear to be offline. Check your connection and try again.",
  timeout: "That took too long. Try again.",
  parse_failed: "MergeMate sent back something unexpected. Try again, or update the app.",
  bot_check_unavailable: "The quick security check couldn't load. Try again, or use the web app.",
  local_cleanup_incomplete: "Your account was deleted. Clear this browser’s site data or this device’s app data to finish removing local information.",
  secure_storage_unavailable: "Secure storage is unavailable. Unlock your device and try again.",
  not_configured: "This build isn't connected to MergeMate's servers yet.",
};

// For these codes the API's own sentence is specific and useful ("That image type is not supported.").
const SERVER_MESSAGE_CODES = new Set<ClientErrorCode>([
  "forbidden",
  "validation_failed",
  "payload_too_large",
  "not_found",
  "consent_required",
]);

/** Accepts a short, single-line sentence of plain text. Anything else falls back to fixed copy. */
function usableServerMessage(message: unknown): string | null {
  if (typeof message !== "string") return null;
  const trimmed = message.trim();
  if (trimmed.length < 3 || trimmed.length > 160) return null;
  for (const ch of trimmed) {
    const code = ch.charCodeAt(0);
    if (code < 32 || code === 127 || "<>{}[]`".includes(ch)) return null;
  }
  return trimmed;
}

/** Plain-language message for an error code. `serverMessage` is only used for a few specific codes. */
export function messageForCode(
  code: ClientErrorCode,
  options: { retryAfterSeconds?: number; serverMessage?: unknown } = {},
): string {
  if (code === "rate_limited" && options.retryAfterSeconds !== undefined && options.retryAfterSeconds > 0) {
    return `You've reached a limit for now. Try again in ${formatWait(options.retryAfterSeconds)}.`;
  }
  if (SERVER_MESSAGE_CODES.has(code)) {
    const server = usableServerMessage(options.serverMessage);
    if (server) return server;
  }
  return FIXED_COPY[code];
}

/** Maps an HTTP status to a code when the body is not a valid API error. */
export function codeFromStatus(status: number): ErrorCode {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 413) return "payload_too_large";
  if (status === 422) return "validation_failed";
  if (status === 429) return "rate_limited";
  if (status === 502 || status === 503 || status === 504) return "upstream_unavailable";
  return "internal";
}

/** Message to show for any thrown value. Unknown errors never leak their text. */
export function toUserMessage(error: unknown, fallback = FIXED_COPY.internal): string {
  if (error instanceof ApiClientError) return error.message;
  return fallback;
}

export function isApiClientError(error: unknown, ...codes: ClientErrorCode[]): error is ApiClientError {
  return error instanceof ApiClientError && (codes.length === 0 || codes.includes(error.code));
}
