import type { Context, MiddlewareHandler } from "hono";
import type { AppEnv, Env, RateLimiter } from "../env";
import { ApiError, ConfigError } from "../errors";

interface RateLimitOptions {
  /** Binding name, used in the configuration error when the binding is missing. */
  name: keyof Env;
  limiter: (env: Env) => RateLimiter | undefined;
  key: (c: Context<AppEnv>) => string;
  /** Seconds the client should wait; matches the binding's period. */
  retryAfter: number;
}

/** Rejects the request with `rate_limited` before any route logic runs. A missing binding fails closed. */
export const rateLimit =
  (options: RateLimitOptions): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    const limiter = options.limiter(c.env);
    if (!limiter) throw new ConfigError(`${options.name} binding is missing`);
    const { success } = await limiter.limit({ key: options.key(c) });
    if (!success) {
      throw new ApiError("rate_limited", "Too many requests. Try again shortly.", {
        "retry-after": String(options.retryAfter),
      });
    }
    await next();
  };

export const clientIp = (c: Context<AppEnv>) => c.req.header("cf-connecting-ip") ?? "unknown";
