import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../env";

const HTML_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

/**
 * Sets security headers on every response, including errors. HTML gets a restrictive CSP.
 * API responses are never cacheable outside the Worker: every network read requires admission.
 */
export const securityHeaders = (): MiddlewareHandler<AppEnv> => async (c, next) => {
  await next();
  const headers = c.res.headers;
  headers.set("strict-transport-security", "max-age=63072000; includeSubDomains");
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "no-referrer");
  headers.set("x-frame-options", "DENY");
  headers.set("cache-control", "no-store");
  if (headers.get("content-type")?.startsWith("text/html")) {
    headers.set("content-security-policy", HTML_CSP);
  }
};
