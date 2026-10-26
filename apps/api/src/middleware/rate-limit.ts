import type { Context } from "hono";
import type { AppEnv, RateLimiter } from "../env";
import { ApiError, ConfigError } from "../errors";

interface LimitOptions {
  /** Binding name, used in the configuration error when the binding is missing. */
  name: string;
  limiter: RateLimiter | undefined;
  key: string;
  /** Seconds the client should wait; matches the binding's period. */
  retryAfter: number;
}

/** Throws `rate_limited` when the key is over its limit. A missing binding fails closed. */
export const limit = async (_c: Context<AppEnv>, options: LimitOptions) => {
  if (!options.limiter) throw new ConfigError(`${options.name} binding is missing`);
  const { success } = await options.limiter.limit({ key: options.key });
  if (!success) {
    throw new ApiError("rate_limited", "Too many requests. Try again shortly.", {
      "retry-after": String(options.retryAfter),
    });
  }
};

export const clientIp = (c: Context<AppEnv>) => c.req.header("cf-connecting-ip") ?? "unknown";
