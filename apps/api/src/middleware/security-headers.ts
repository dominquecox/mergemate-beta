import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../env";

const HTML_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

/**
 * Sets security headers on every response, including errors. HTML gets a restrictive CSP.
 * Responses are not cacheable unless a route opts in with its own Cache-Control.
 */
export const securityHeaders = (): MiddlewareHandler<AppEnv> => async (c, next) => {
  await next();
  const headers = c.res.headers;
  headers.set("strict-transport-security", "max-age=63072000; includeSubDomains");
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "no-referrer");
  headers.set("x-frame-options", "DENY");
  if (!headers.has("cache-control")) headers.set("cache-control", "no-store");
  if (headers.get("content-type")?.startsWith("text/html")) {
    headers.set("content-security-policy", HTML_CSP);
  }
};
