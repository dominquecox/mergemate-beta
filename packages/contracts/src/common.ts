import { z } from "zod";

/** Error codes returned in the `error.code` field of every failed response. */
export const ErrorCode = z.enum([
  "unauthorized",
  "forbidden",
  /** A cookie session sent a write without a valid CSRF token. Fetch /v1/auth/csrf and retry once. */
  "csrf_invalid",
  "consent_required",
  "sso_required",
  "payload_too_large",
  "not_found",
  "validation_failed",
  "rate_limited",
  "rate_limit_unavailable",
  "upstream_unavailable",
  "misconfigured",
  "internal",
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ErrorBody = z.object({
  error: z.object({
    code: ErrorCode,
    message: z.string(),
    requestId: z.string(),
  }),
});
export type ErrorBody = z.infer<typeof ErrorBody>;

/** ISO-8601 UTC timestamp. */
export const IsoDateTime = z.iso.datetime();
export type IsoDateTime = z.infer<typeof IsoDateTime>;

/** A page of results with an opaque cursor; `nextCursor` is null on the last page. */
export const pageOf = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  });

/** Pull request reference in the form `owner/repo#number`. */
export const PrRef = z.string().regex(/^[\w.-]+\/[\w.-]+#[1-9]\d*$/);
export type PrRef = z.infer<typeof PrRef>;

export const RiskLevel = z.enum(["low", "medium", "high"]);
export type RiskLevel = z.infer<typeof RiskLevel>;

export const HealthResponse = z.object({
  ok: z.literal(true),
  version: z.string(),
});
export type HealthResponse = z.infer<typeof HealthResponse>;
