import type { MiddlewareHandler } from "hono";
import { cors as honoCors } from "hono/cors";
import { corsOrigins } from "../config";
import type { AppEnv } from "../env";

/** Exact-origin allowlist with credentials. No wildcard. */
export const cors = (): MiddlewareHandler<AppEnv> =>
  honoCors({
    origin: (origin, c) => (corsOrigins(c.env).includes(origin) ? origin : null),
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowHeaders: ["authorization", "content-type", "x-csrf-token"],
    exposeHeaders: ["x-request-id", "retry-after", "x-sso-url"],
    maxAge: 600,
  });
