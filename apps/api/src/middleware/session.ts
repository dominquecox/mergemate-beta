import type { Context, MiddlewareHandler } from "hono";
import { requireBinding } from "../config";
import type { AppEnv } from "../env";
import { ApiError } from "../errors";
import { timingSafeEqual } from "../lib/crypto";
import { readSessionCookie, resolveSession } from "../lib/sessions";
import { clientIp, limit } from "./rate-limit";

const PUBLIC_PATHS = [
  /^\/v1\/health$/,
  /^\/v1\/auth\/github\/(start|callback)$/,
  /^\/v1\/auth\/demo$/,
  /^\/v1\/public\//,
  /^\/v1\/webhooks\//,
];

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
// The only write a demo session may make.
const DEMO_WRITES = new Set(["/v1/auth/logout"]);

const limitIp = (c: Context<AppEnv>) =>
  limit(c, { name: "IP_RATE_LIMITER", limiter: c.env.IP_RATE_LIMITER, key: clientIp(c), retryAfter: 60 });

const readCredential = (c: Context<AppEnv>) => {
  const auth = c.req.header("authorization");
  if (auth) {
    const match = /^Bearer ([A-Za-z0-9_-]{20,128})$/.exec(auth);
    return match?.[1] ? { token: match[1], transport: "bearer" as const } : null;
  }
  const cookie = readSessionCookie(c.req.header("cookie"));
  return cookie ? { token: cookie, transport: "cookie" as const } : null;
};

const unauthorized = () => new ApiError("unauthorized", "Sign in to continue.");

/**
 * Runs before any route logic. Public paths are limited per IP. Every other path needs a live
 * session (failed attempts also count against the IP), is limited per session, checks CSRF on
 * cookie writes, blocks suspended users and keeps demo sessions read-only.
 */
export const authenticate = (): MiddlewareHandler<AppEnv> => async (c, next) => {
  const path = c.req.path;
  if (!path.startsWith("/v1/") || PUBLIC_PATHS.some((p) => p.test(path))) {
    await limitIp(c);
    return next();
  }

  const credential = readCredential(c);
  const session = credential
    ? await resolveSession(requireBinding(c.env, "DB"), credential.token, c.get("deps").now())
    : null;
  if (!credential || !session || session.transport !== credential.transport) {
    await limitIp(c);
    throw unauthorized();
  }

  await limit(c, {
    name: "SESSION_RATE_LIMITER",
    limiter: c.env.SESSION_RATE_LIMITER,
    key: session.tokenHash,
    retryAfter: 60,
  });

  const write = !SAFE_METHODS.has(c.req.method);
  if (write && session.transport === "cookie") {
    const header = c.req.header("x-csrf-token") ?? "";
    if (!session.csrfToken || !timingSafeEqual(header, session.csrfToken)) {
      throw new ApiError("forbidden", "Missing or invalid CSRF token.");
    }
  }
  if (session.demo && write && !DEMO_WRITES.has(path)) {
    throw new ApiError("forbidden", "Not available in the demo.");
  }
  if (!session.demo && session.userStatus !== "active") {
    throw new ApiError("forbidden", "This account is suspended.");
  }

  c.set("session", session);
  await next();
};
