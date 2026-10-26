import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../env";

/** Assigns a fresh id to every request and echoes it in `x-request-id`. Client-sent ids are ignored. */
export const requestId = (): MiddlewareHandler<AppEnv> => async (c, next) => {
  const id = crypto.randomUUID();
  c.set("requestId", id);
  await next();
  c.res.headers.set("x-request-id", id);
};
