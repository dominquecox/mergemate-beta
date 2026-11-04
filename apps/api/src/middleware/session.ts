import type { Context, MiddlewareHandler } from "hono";
import { corsOrigins, requireBinding } from "../config";
import type { AppEnv } from "../env";
import { ApiError } from "../errors";
import { timingSafeEqual } from "../lib/crypto";
import { readSessionCookie, resolveSession, resolveSpentSessionForLogout } from "../lib/sessions";
import { clientIp, limit } from "./rate-limit";
import { brainEnabled } from "../brain/flag";

const PUBLIC_PATHS = [
  /^\/v1\/health$/,
  /^\/v1\/flags$/,
  /^\/v1\/auth\/github\/(start|callback)$/,
  /^\/v1\/auth\/demo$/,
  /^\/v1\/public\//,
  /^\/v1\/webhooks\//,
];

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
// The only write a demo session may make.
const DEMO_WRITES = new Set(["/v1/auth/logout"]);
// Fixture-only AI endpoints: demo sessions get pre-generated results here and their
// handlers return before any provider or data call, so no live call is possible.
const DEMO_FIXTURE_POSTS = [/^\/v1\/prs\/[^/]+\/[^/]+\/\d+\/(summary|risk|plan|ask)$/];

const limitIp = (c: Context<AppEnv>) =>
  limit(c, { scope: "ip", key: clientIp(c) });

/**
 * Counts CORS preflights (OPTIONS) against the IP limit. Runs before CORS because CORS
 * answers preflights without reaching later middleware; without this a preflight flood
 * is free. Other requests pass through untouched and are charged once in authenticate().
 */
export const limitPreflight = (): MiddlewareHandler<AppEnv> => async (c, next) => {
  if (c.req.method === "OPTIONS") {
    const origin=c.req.header("origin");
    if(origin&&corsOrigins(c.env).includes(origin)){c.header("access-control-allow-origin",origin);c.header("access-control-allow-credentials","true");c.header("vary","Origin");}
    await limitIp(c);
  }
  return next();
};

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
  // Webhooks are authenticated by their signature, and providers send from shared IPs.
  if (path.startsWith("/v1/webhooks/")) return next();
  if (!path.startsWith("/v1/") || PUBLIC_PATHS.some((p) => p.test(path))) {
    await limitIp(c);
    return next();
  }

  // The brain answers as if absent while its flag is off, before any session lookup.
  if (path.startsWith("/v1/brain/") && !(await brainEnabled(c.env))) {
    await limitIp(c);
    throw new ApiError("not_found", "Not found.");
  }

  const credential = readCredential(c);
  const logout=path==="/v1/auth/logout" && c.req.method==="POST";
  const logoutCapability=logout || (path==="/v1/auth/csrf" && c.req.method==="GET");
  let session = credential
    ? await resolveSession(requireBinding(c.env, "DB"), credential.token, c.get("deps").now())
    : null;
  if(!session && credential && logoutCapability)session=await resolveSpentSessionForLogout(requireBinding(c.env,"DB"),credential.token,c.get("deps").now());
  if (!credential || !session || session.transport !== credential.transport) {
    await limitIp(c);
    throw unauthorized();
  }

  const accountRemoval=path==='/v1/account' && c.req.method==='DELETE';
  const deletionRecovery=accountRemoval || (path==='/v1/me' && c.req.method==='GET') || logoutCapability;

  // Revocation and deletion recovery stay possible after the session budget is exhausted.
  if(logoutCapability || accountRemoval || (session.deletionPending && deletionRecovery))await limitIp(c);
  else await limit(c, {scope:"session",key:session.familyId??session.tokenHash});
  if(session.deletionPending && !deletionRecovery)throw new ApiError('forbidden','Account deletion is pending. Finish deleting your account or sign out.');

  const write = !SAFE_METHODS.has(c.req.method);
  if (write && session.transport === "cookie") {
    const header = c.req.header("x-csrf-token") ?? "";
    if (!session.csrfToken || !timingSafeEqual(header, session.csrfToken)) {
      throw new ApiError("csrf_invalid", "Missing or invalid CSRF token.");
    }
  }
  if (
    session.demo &&
    write &&
    !DEMO_WRITES.has(path) &&
    !DEMO_FIXTURE_POSTS.some((pattern) => pattern.test(path))
  ) {
    throw new ApiError("forbidden", "Not available in the demo.");
  }
  if (!logoutCapability && !accountRemoval && !(session.deletionPending && deletionRecovery) && !session.demo && session.userStatus !== "active") {
    throw new ApiError("forbidden", "This account is suspended.");
  }

  c.set("session", session);
  await next();
};
