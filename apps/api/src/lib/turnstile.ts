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
    .then(async (res) => (res.ok ? ((await res.json()) as { success?: boolean; "error-codes"?: unknown }) : `siteverify status ${res.status}`))
    .catch((e: unknown) => `siteverify ${e instanceof Error ? e.name : "error"}`);
  // Logs carry only the status or Cloudflare's error codes, never the token or secret.
  if (typeof result === "string") throw new ApiError("upstream_unavailable", "The bot check is unavailable. Try again.", {}, result);
  if (result.success !== true) {
    const codes = Array.isArray(result["error-codes"]) ? result["error-codes"].filter((v) => typeof v === "string").join(",") : "";
    throw new ApiError("forbidden", "The bot check failed. Try again.", {}, `turnstile rejected ${codes || "unknown"}`);
  }
};
