import type { ErrorBody, ErrorCode } from "@mergemate/contracts";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { AppEnv } from "./env";

export const ERROR_STATUS: Record<ErrorCode, ContentfulStatusCode> = {
  unauthorized: 401,
  forbidden: 403,
  csrf_invalid: 403,
  consent_required: 403,
  consent_changed:409,
  sso_required: 403,
  payload_too_large: 413,
  not_found: 404,
  pr_changed:409,
  validation_failed: 422,
  state_conflict:409,
  rate_limited: 429,
  rate_limit_unavailable: 503,
  upstream_unavailable: 502,
  misconfigured: 500,
  internal: 500,
};

/** An error that maps directly to an API error response. Messages are shown to clients. */
export class ApiError extends Error {
  override readonly name: string = "ApiError";

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly headers: Record<string, string> = {},
    /** For the log only, never the client: which upstream step failed and its HTTP status. No request or response content. */
    readonly logDetail?: string,
  ) {
    super(message);
  }
}

/**
 * Missing or invalid Worker configuration. `detail` names the setting for the log;
 * it must never contain a configured value. Clients only see a generic message.
 */
export class ConfigError extends ApiError {
  override readonly name = "ConfigError";

  constructor(readonly detail: string) {
    super("misconfigured", "The service is not configured correctly.");
  }
}

export const errorResponse = (
  c: Context<AppEnv>,
  code: ErrorCode,
  message: string,
  headers: Record<string, string> = {},
) => {
  const body: ErrorBody = { error: { code, message, requestId: c.get("requestId") } };
  return c.json(body, ERROR_STATUS[code], headers);
};
