import { ErrorBody } from "@mergemate/contracts";
import { describe, expect, it, vi } from "vitest";
import { json, testContext } from "./helpers";
import { appFor, ghUser, post, signIn, tokenResponse, verifierPair } from "./sign-in";

const DAY = 24 * 60 * 60 * 1000;

describe("POST /v1/auth/github/start", () => {
  it("returns a PKCE authorize URL and stores single-use state", async () => {
    const ctx = testContext();
    const { challenge } = verifierPair();
    const res = await appFor(ctx)("/v1/auth/github/start", post({ codeChallenge: challenge, platform: "web" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { authorizeUrl: string; state: string };
    const url = new URL(body.authorizeUrl);
    expect(url.origin + url.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("Iv-test-client");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:8081/auth/callback");
    expect(url.searchParams.get("code_challenge")).toBe(challenge);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe(body.state);
    const rows = ctx.db.rows<{ expires_at: string }>("SELECT expires_at FROM oauth_states");
    expect(rows).toEqual([{ expires_at: "2026-10-27T12:10:00.000Z" }]);
  });

  it("uses the HTTPS native relay for iOS while keeping GitHub on its registered host", async () => {
    const ctx = testContext();
    const res = await appFor(ctx)("/v1/auth/github/start", post({ codeChallenge: verifierPair().challenge, platform: "ios" }));
    const url = new URL(((await res.json()) as { authorizeUrl: string }).authorizeUrl);
    expect(url.searchParams.get("redirect_uri")).toBe("https://dev.mergemate.dev/auth/callback");
  });

  it("refuses a web origin outside the allowlist for the environment", async () => {
    const ctx = testContext({ APP_ENV: "production", WEB_ORIGIN: "http://localhost:8081" });
    const res = await appFor(ctx)("/v1/auth/github/start", post({ codeChallenge: verifierPair().challenge, platform: "web" }));
    expect(res.status).toBe(500);
    expect(ErrorBody.parse(await res.json()).error.code).toBe("misconfigured");
  });

  it("rejects a malformed challenge", async () => {
    const ctx = testContext();
    const res = await appFor(ctx)("/v1/auth/github/start", post({ codeChallenge: "short", platform: "ios" }));
    expect(res.status).toBe(422);
  });
});

describe("POST /v1/auth/github/callback", () => {
  it("signs in on iOS with a bearer token and stores only hashes and ciphertext", async () => {
    const ctx = testContext();
    const { body, headers } = await signIn(ctx, "ios");
    expect(body.user).toMatchObject({ login: "octo-dev", name: "Octo Dev" });
    expect(body.session.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(body.session.csrfToken).toBeUndefined();

    const exchange = ctx.net.calls.find((c) => c.url === "https://github.com/login/oauth/access_token");
    expect(JSON.parse(exchange?.body ?? "{}")).toMatchObject({
      code: "test-code",
      redirect_uri: "https://dev.mergemate.dev/auth/callback",
    });

    const sessions = ctx.db.rows<{ token_hash: string }>("SELECT token_hash FROM sessions");
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.token_hash).not.toContain(body.session.token);
    const dump = JSON.stringify(ctx.db.rows("SELECT * FROM github_tokens"));
    expect(dump).not.toContain(tokenResponse().access_token);
    expect(dump).not.toContain(tokenResponse().refresh_token);

    const me = await appFor(ctx)("/v1/me", { headers });
    expect(await me.json()).toMatchObject({ login: "octo-dev" });
    expect(me.headers.get("cache-control")).toBe("no-store");
  });

  it("signs in on web with a __Host- cookie and a CSRF token, without exposing the token", async () => {
    const ctx = testContext();
    const { res, body } = await signIn(ctx, "web");
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/^__Host-mm_session=[A-Za-z0-9_-]{43}; Path=\/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax$/);
    expect(cookie).not.toMatch(/Domain/i);
    expect(body.session.token).toBeUndefined();
    expect(body.session.csrfToken).toBeTruthy();
  });

  it("accepts a state only once", async () => {
    const ctx = testContext();
    ctx.net
      .on("POST", "https://github.com/login/oauth/access_token", () => json(tokenResponse()))
      .on("GET", "https://api.github.com/user", ghUser);
    const call = appFor(ctx);
    const { verifier, challenge } = verifierPair();
    const { state } = (await (await call("/v1/auth/github/start", post({ codeChallenge: challenge, platform: "ios" }))).json()) as {
      state: string;
    };
    const body = { code: "c", state, codeVerifier: verifier };
    expect((await call("/v1/auth/github/callback", post(body))).status).toBe(200);
    expect((await call("/v1/auth/github/callback", post(body))).status).toBe(403);
  });

  it("rejects an expired state", async () => {
    const ctx = testContext();
    const call = appFor(ctx);
    const { verifier, challenge } = verifierPair();
    const { state } = (await (await call("/v1/auth/github/start", post({ codeChallenge: challenge, platform: "ios" }))).json()) as {
      state: string;
    };
    ctx.time.advance(10 * 60 * 1000 + 1);
    const res = await call("/v1/auth/github/callback", post({ code: "c", state, codeVerifier: verifier }));
    expect(res.status).toBe(403);
    expect(ctx.net.calls).toHaveLength(0);
  });

  it("rejects a verifier that does not match the challenge, and burns the state", async () => {
    const ctx = testContext();
    const call = appFor(ctx);
    const { state } = (await (
      await call("/v1/auth/github/start", post({ codeChallenge: verifierPair().challenge, platform: "ios" }))
    ).json()) as { state: string };
    const res = await call("/v1/auth/github/callback", post({ code: "c", state, codeVerifier: verifierPair().verifier }));
    expect(res.status).toBe(403);
    expect(ctx.db.rows("SELECT * FROM oauth_states")).toHaveLength(0);
    expect(ctx.net.calls).toHaveLength(0);
  });

  it("rejects a code GitHub refuses", async () => {
    const ctx = testContext();
    ctx.net.on("POST", "https://github.com/login/oauth/access_token", { error: "bad_verification_code" });
    const call = appFor(ctx);
    const { verifier, challenge } = verifierPair();
    const { state } = (await (await call("/v1/auth/github/start", post({ codeChallenge: challenge, platform: "ios" }))).json()) as {
      state: string;
    };
    expect((await call("/v1/auth/github/callback", post({ code: "c", state, codeVerifier: verifier }))).status).toBe(403);
    expect(ctx.db.rows("SELECT * FROM users")).toHaveLength(0);
  });

  it("refuses sign-in for a suspended user", async () => {
    const ctx = testContext();
    await signIn(ctx, "ios");
    ctx.db.sqlite.exec("UPDATE users SET status = 'suspended'");
    await expect(signIn(ctx, "ios")).rejects.toThrow(/403/);
  });
});

describe("sessions", () => {
  it("rejects requests without a session", async () => {
    const res = await appFor(testContext())("/v1/me");
    expect(res.status).toBe(401);
    expect(ErrorBody.parse(await res.json()).error.code).toBe("unauthorized");
  });

  it("rejects a bearer token presented as a cookie", async () => {
    const ctx = testContext();
    const { body } = await signIn(ctx, "ios");
    const res = await appFor(ctx)("/v1/me", { headers: { cookie: `__Host-mm_session=${body.session.token}` } });
    expect(res.status).toBe(401);
  });

  it("expires idle sessions after 7 days and all sessions after 30", async () => {
    const ctx = testContext();
    const { headers } = await signIn(ctx, "ios");
    ctx.time.advance(6 * DAY);
    expect((await appFor(ctx)("/v1/me", { headers })).status).toBe(200);
    ctx.time.advance(7 * DAY + 1);
    expect((await appFor(ctx)("/v1/me", { headers })).status).toBe(401);
    expect(ctx.db.rows("SELECT * FROM sessions")).toHaveLength(0);

    const again = await signIn(ctx, "ios");
    for (let d = 0; d < 4; d++) {
      ctx.time.advance(6 * DAY);
      expect((await appFor(ctx)("/v1/me", { headers: again.headers })).status).toBe(200);
    }
    ctx.time.advance(6 * DAY);
    expect((await appFor(ctx)("/v1/me", { headers: again.headers })).status).toBe(401);
  });

  it("rotates the token on refresh and keeps the original expiry", async () => {
    const ctx = testContext();
    const { headers, body } = await signIn(ctx, "ios");
    const res = await appFor(ctx)("/v1/auth/refresh", { method: "POST", headers });
    const next = (await res.json()) as { session: { token: string; expiresAt: string } };
    expect(next.session.token).not.toBe((body.session as { token: string }).token);
    expect(next.session.expiresAt).toBe("2026-11-26T12:00:00.000Z");
    expect((await appFor(ctx)("/v1/me", { headers })).status).toBe(401);
    expect((await appFor(ctx)("/v1/me", { headers: { authorization: `Bearer ${next.session.token}` } })).status).toBe(200);
  });

  it("logout deletes the session", async () => {
    const ctx = testContext();
    const { headers } = await signIn(ctx, "ios");
    expect((await appFor(ctx)("/v1/auth/logout", { method: "POST", headers })).status).toBe(204);
    expect((await appFor(ctx)("/v1/me", { headers })).status).toBe(401);
  });

  it("requires the CSRF token for cookie writes", async () => {
    const ctx = testContext();
    const { headers, csrf } = await signIn(ctx, "web");
    const call = appFor(ctx);
    expect((await call("/v1/me", { headers })).status).toBe(200);
    expect((await call("/v1/auth/logout", { method: "POST", headers })).status).toBe(403);
    expect((await call("/v1/auth/logout", { method: "POST", headers: { ...headers, "x-csrf-token": "wrong" } })).status).toBe(403);
    const csrfRes = (await (await call("/v1/auth/csrf", { headers })).json()) as { csrfToken: string };
    expect(csrfRes.csrfToken).toBe(csrf);
    const out = await call("/v1/auth/logout", { method: "POST", headers: { ...headers, "x-csrf-token": csrf ?? "" } });
    expect(out.status).toBe(204);
    expect(out.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("blocks a suspended user on every request", async () => {
    const ctx = testContext();
    const { headers } = await signIn(ctx, "ios");
    ctx.db.sqlite.exec("UPDATE users SET status = 'suspended'");
    const res = await appFor(ctx)("/v1/me", { headers });
    expect(res.status).toBe(403);
  });

  it("limits authenticated requests per session and failed attempts per IP", async () => {
    const ctx = testContext();
    const { headers } = await signIn(ctx, "ios");
    const ipBefore = ctx.ipLimiter.keys.length;
    await appFor(ctx)("/v1/me", { headers });
    expect(ctx.sessionLimiter.keys).toHaveLength(1);
    expect(ctx.ipLimiter.keys).toHaveLength(ipBefore);
    await appFor(ctx)("/v1/me", { headers: { authorization: `Bearer ${"x".repeat(43)}` } });
    expect(ctx.ipLimiter.keys).toHaveLength(ipBefore + 1);
  });
});

describe("demo", () => {
  const turnstile = (success: boolean) => json({ success });

  it("starts a read-only demo session on fixtures after the bot check", async () => {
    const ctx = testContext();
    ctx.net.on("POST", "https://challenges.cloudflare.com/turnstile/v0/siteverify", () => turnstile(true));
    const call = appFor(ctx);
    const res = await call("/v1/auth/demo", post({ turnstileToken: "tt", platform: "ios" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { session: { token: string; demo: boolean } };
    expect(body.session.demo).toBe(true);
    const headers = { authorization: `Bearer ${body.session.token}` };

    expect(await (await call("/v1/me", { headers })).json()).toMatchObject({ login: "demo-reviewer" });
    const repos = (await (await call("/v1/repos", { headers })).json()) as { items: unknown[] };
    expect(repos.items.length).toBeGreaterThan(0);
    const inbox = (await (await call("/v1/notifications", { headers })).json()) as { items: { id: string; repo: string; number: number }[] };
    expect(inbox.items.length).toBeGreaterThan(0);
    const first = inbox.items[0];
    expect((await call(`/v1/prs/${first?.repo}/${first?.number}`, { headers })).status).toBe(200);

    for (const [path, init] of [
      [`/v1/notifications/${first?.id}/done`, { method: "POST" }],
      ["/v1/account", { method: "DELETE" }],
      ["/v1/events", post({ name: "app_open" })],
      ["/v1/repos/1001/watch", { method: "PUT", body: JSON.stringify({ watching: false }) }],
    ] as const) {
      const r = await call(path, { ...init, headers: { ...headers, ...(init as RequestInit).headers } });
      expect(r.status, path).toBe(403);
    }
    expect((await call("/v1/auth/logout", { method: "POST", headers })).status).toBe(204);
    // Only the bot check left the Worker: no GitHub or AI calls.
    expect(ctx.net.calls.map((c) => c.url)).toEqual(["https://challenges.cloudflare.com/turnstile/v0/siteverify"]);
  });

  it("refuses the demo when the bot check fails", async () => {
    const ctx = testContext();
    ctx.net.on("POST", "https://challenges.cloudflare.com/turnstile/v0/siteverify", () => turnstile(false));
    const res = await appFor(ctx)("/v1/auth/demo", post({ turnstileToken: "tt", platform: "web" }));
    expect(res.status).toBe(403);
    expect(ctx.db.rows("SELECT * FROM sessions")).toHaveLength(0);
  });

  it("logs only the siteverify status when the bot check service fails", async () => {
    const ctx = testContext();
    ctx.net.on("POST", "https://challenges.cloudflare.com/turnstile/v0/siteverify", () => new Response("down", { status: 500 }));
    const logged: string[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((line: unknown) => { logged.push(String(line)); });
    const res = await appFor(ctx)("/v1/auth/demo", post({ turnstileToken: "secret-token-value", platform: "web" }));
    spy.mockRestore();
    expect(res.status).toBe(502);
    expect(logged.join("\n")).toContain("siteverify status 500");
    expect(logged.join("\n")).not.toContain("secret-token-value");
    expect(ctx.db.rows("SELECT * FROM sessions")).toHaveLength(0);
  });
});

describe("CORS", () => {
  it("echoes allowlisted origins with credentials and ignores others", async () => {
    const call = appFor(testContext());
    const ok = await call("/v1/health", { headers: { origin: "http://localhost:8081" } });
    expect(ok.headers.get("access-control-allow-origin")).toBe("http://localhost:8081");
    expect(ok.headers.get("access-control-allow-credentials")).toBe("true");
    const bad = await call("/v1/health", { headers: { origin: "https://evil.example" } });
    expect(bad.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("does not allow development origins in production", async () => {
    const call = appFor(testContext({ APP_ENV: "production", WEB_ORIGIN: "https://app.mergemate.dev" }));
    const res = await call("/v1/health", { headers: { origin: "https://dev.mergemate.dev" } });
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("answers preflight for the CSRF header", async () => {
    const res = await appFor(testContext())("/v1/auth/logout", {
      method: "OPTIONS",
      headers: {
        origin: "https://dev.mergemate.dev",
        "access-control-request-method": "POST",
        "access-control-request-headers": "x-csrf-token",
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-headers")).toContain("x-csrf-token");
  });

  it("answers preflight for PATCH, which board card edits use", async () => {
    const res = await appFor(testContext())("/v1/brain/cards", {
      method: "OPTIONS",
      headers: { origin: "https://dev.mergemate.dev", "access-control-request-method": "PATCH", "access-control-request-headers": "content-type,x-csrf-token" },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-methods")).toContain("PATCH");
  });
});

// The installed app opts in; older binaries retain their existing HTTPS callback.
describe('MM086 native browser relay',()=>{
 it.each(['ios','android'] as const)('returns %s over HTTPS relay and exchanges only for a native bearer session',async platform=>{
  const ctx=testContext(),pair=verifierPair(),call=appFor(ctx);
  const start=await call('/v1/auth/github/start',post({platform,codeChallenge:pair.challenge,nativeBrowser:true}));
  const body=await start.json() as {authorizeUrl:string;state:string};
  expect(new URL(body.authorizeUrl).searchParams.get('redirect_uri')).toBe('https://dev.mergemate.dev/auth/callback');
  expect(body.state.startsWith('n_')).toBe(true);
  ctx.net.on('POST','https://github.com/login/oauth/access_token',tokenResponse()).on('GET','https://api.github.com/user',ghUser);
  const returned=await call('/v1/auth/github/callback',post({code:'test-code',state:body.state,codeVerifier:pair.verifier}));
  expect(returned.status).toBe(200);expect(returned.headers.get('set-cookie')).toBeNull();
  const result=await returned.json() as {session:{token?:string;csrfToken?:string}};
  expect(result.session.token).toBeTruthy();expect(result.session.csrfToken).toBeUndefined();
  expect(ctx.net.calls.find(c=>c.url==='https://github.com/login/oauth/access_token')?.body).toContain('auth/callback');
 });
 it('rejects native relay selection for web transport',async()=>{
  const ctx=testContext();expect((await appFor(ctx)('/v1/auth/github/start',post({platform:'web',codeChallenge:verifierPair().challenge,nativeBrowser:true}))).status).toBe(422);
 });
});
