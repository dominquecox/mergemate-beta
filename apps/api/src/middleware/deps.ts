import type { MiddlewareHandler } from "hono";
import type { AppEnv, Deps } from "../env";

export const provideDeps =
  (deps: Deps): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    c.set("deps", deps);
    await next();
  };
