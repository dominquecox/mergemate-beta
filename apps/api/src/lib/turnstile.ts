import type { Context } from "hono";
import { requireVar } from "../config";
import type { AppEnv } from "../env";
import { ApiError } from "../errors";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Verifies a Turnstile token server-side. Throws `forbidden` on failure. */
export const verifyTurnstile = async (c: Context<AppEnv>, token: string) => {
  const result = await c
    .get("deps")
    .fetch(VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        secret: requireVar(c.env, "TURNSTILE_SECRET_KEY"),
        response: token,
        remoteip: c.req.header("cf-connecting-ip"),
      }),
      signal: AbortSignal.timeout(20_000),
    })
    .then((res) => (res.ok ? (res.json() as Promise<{ success?: boolean }>) : null))
    .catch(() => null);
  if (!result) throw new ApiError("upstream_unavailable", "The bot check is unavailable. Try again.");
  if (result.success !== true) throw new ApiError("forbidden", "The bot check failed. Try again.");
};
