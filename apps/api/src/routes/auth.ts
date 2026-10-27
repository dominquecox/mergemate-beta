import {
  AuthCallbackRequest,
  type AuthCallbackResponse,
  AuthStartRequest,
  type AuthStartResponse,
  type CsrfResponse,
  DemoRequest,
  type RefreshResponse,
  type Session,
  type Me,
  type User,
} from "@mergemate/contracts";
import { type Context, Hono } from "hono";
import { callbackUrl, type Platform, requireBinding, requireVar } from "../config";
import type { AppEnv } from "../env";
import { ApiError } from "../errors";
import { pkceChallenge, randomToken, timingSafeEqual } from "../lib/crypto";
import { GITHUB_WEB, githubGet, requestTokens } from "../lib/github";
import { saveTokens } from "../lib/github-tokens";
import {
  clearedSessionCookie,
  createSession,
  deleteSession,
  type IssuedSession,
  rotateSession,
  sessionCookie,
  type Transport,
} from "../lib/sessions";
import { verifyTurnstile } from "../lib/turnstile";
import { parseBody } from "../lib/validate";
import { DEMO_USER } from "./github.fixtures";

const STATE_TTL_MS = 10 * 60 * 1000;

const transportFor = (platform: Platform): Transport => (platform === "web" ? "cookie" : "bearer");

/** Native clients get the token in the body; web gets it only as an HttpOnly cookie. */
const sessionBody = (c: Context<AppEnv>, issued: IssuedSession, transport: Transport, demo: boolean): Session => {
  if (transport === "cookie") {
    c.header("set-cookie", sessionCookie(issued.token, issued.expiresAt, c.get("deps").now()), { append: true });
  }
  return {
    ...(transport === "bearer" ? { token: issued.token } : {}),
    expiresAt: issued.expiresAt,
    ...(issued.csrfToken ? { csrfToken: issued.csrfToken } : {}),
    ...(demo ? { demo: true as const } : {}),
  };
};

const signInFailed = () => new ApiError("forbidden", "Sign-in failed or expired. Start again.");

interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string;
}

interface UserRow {
  id: string;
  login: string;
  name: string | null;
  avatar_url: string;
  status: string;
}

const toUser = (row: UserRow): User => ({ id: row.id, login: row.login, name: row.name, avatarUrl: row.avatar_url });

export const auth = new Hono<AppEnv>()
  .post("/auth/github/start", async (c) => {
    const body = await parseBody(c, AuthStartRequest);
    const db = requireBinding(c.env, "DB");
    const now = c.get("deps").now();
    const redirectUri = callbackUrl(c.env, body.platform);
    const clientId = requireVar(c.env, "GITHUB_APP_CLIENT_ID");
    const state = randomToken();

    await db.batch([
      db.prepare("DELETE FROM oauth_states WHERE expires_at <= ?").bind(now.toISOString()),
      db
        .prepare(
          "INSERT INTO oauth_states (state, code_challenge, platform, redirect_uri, expires_at) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(state, body.codeChallenge, body.platform, redirectUri, new Date(now.getTime() + STATE_TTL_MS).toISOString()),
    ]);

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      state,
      code_challenge: body.codeChallenge,
      code_challenge_method: "S256",
    });
    const res: AuthStartResponse = { authorizeUrl: `${GITHUB_WEB}/login/oauth/authorize?${params}`, state };
    return c.json(res);
  })

  .post("/auth/github/callback", async (c) => {
    const body = await parseBody(c, AuthCallbackRequest);
    const db = requireBinding(c.env, "DB");
    const deps = c.get("deps");
    const now = deps.now();

    // Single use: the row is deleted as it is read, whatever happens next.
    const pending = await db
      .prepare("DELETE FROM oauth_states WHERE state = ? RETURNING code_challenge, platform, redirect_uri, expires_at")
      .bind(body.state)
      .first<{ code_challenge: string; platform: Platform; redirect_uri: string; expires_at: string }>();
    if (!pending || Date.parse(pending.expires_at) <= now.getTime()) throw signInFailed();
    if (!timingSafeEqual(await pkceChallenge(body.codeVerifier), pending.code_challenge)) throw signInFailed();

    const exchange = await requestTokens(deps, {
      client_id: requireVar(c.env, "GITHUB_APP_CLIENT_ID"),
      client_secret: requireVar(c.env, "GITHUB_APP_CLIENT_SECRET"),
      code: body.code,
      redirect_uri: pending.redirect_uri,
      code_verifier: body.codeVerifier,
    });
    if (!exchange.ok) throw signInFailed();

    const gh = await githubGet<GitHubUser>(deps, exchange.tokens.accessToken, "/user");
    const user = await db
      .prepare(
        `INSERT INTO users (id, github_id, login, name, avatar_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (github_id) DO UPDATE SET login = excluded.login, name = excluded.name,
           avatar_url = excluded.avatar_url, updated_at = excluded.updated_at
         RETURNING id, login, name, avatar_url, status`,
      )
      .bind(crypto.randomUUID(), gh.id, gh.login, gh.name, gh.avatar_url, now.toISOString(), now.toISOString())
      .first<UserRow>();
    if (!user) throw new ApiError("internal", "Something went wrong.");
    if (user.status !== "active") throw new ApiError("forbidden", "This account is suspended.");

    await saveTokens(c.env, user.id, exchange.tokens, now);
    const transport = transportFor(pending.platform);
    const issued = await createSession(db, { userId: user.id, transport, now });
    const res: AuthCallbackResponse = { session: sessionBody(c, issued, transport, false), user: toUser(user) };
    return c.json(res);
  })

  .post("/auth/demo", async (c) => {
    const body = await parseBody(c, DemoRequest);
    const deps = c.get("deps");
    await verifyTurnstile(c, body.turnstileToken);

    const transport = transportFor(body.platform);
    const issued = await createSession(requireBinding(c.env, "DB"), { userId: null, transport, now: deps.now() });
    const res: AuthCallbackResponse = { session: sessionBody(c, issued, transport, true), user: DEMO_USER };
    return c.json(res);
  })

  .post("/auth/logout", async (c) => {
    await deleteSession(requireBinding(c.env, "DB"), c.get("session").tokenHash);
    if (c.get("session").transport === "cookie") c.header("set-cookie", clearedSessionCookie());
    return c.body(null, 204);
  })

  .post("/auth/refresh", async (c) => {
    const session = c.get("session");
    const issued = await rotateSession(requireBinding(c.env, "DB"), session, c.get("deps").now());
    const res: RefreshResponse = { session: sessionBody(c, issued, session.transport, session.demo) };
    return c.json(res);
  })

  .get("/auth/csrf", (c) => {
    const { csrfToken } = c.get("session");
    if (!csrfToken) throw new ApiError("not_found", "Not found.");
    const res: CsrfResponse = { csrfToken };
    return c.json(res);
  })

  .get("/me", async (c) => {
    const session = c.get("session");
    if (session.demo || !session.userId) return c.json({ ...DEMO_USER, demo: true } satisfies Me);
    const row = await requireBinding(c.env, "DB")
      .prepare("SELECT id, login, name, avatar_url, status FROM users WHERE id = ?")
      .bind(session.userId)
      .first<UserRow>();
    if (!row) throw new ApiError("unauthorized", "Sign in to continue.");
    return c.json({ ...toUser(row), demo: false } satisfies Me);
  });
