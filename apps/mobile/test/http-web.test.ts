import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, vi } from "vitest";
import { getInMemoryCsrfToken, setInMemoryCsrfToken } from "../src/api/client";
import { ApiClientError } from "../src/api/errors";
import { BASE, MemoryTokenStore, NOW, USER, errorResponse, jsonResponse, makeClient } from "./helpers";

const CSRF_A = "csrf_token_aaaaaaaaaaaaaaaaaaaa";
const CSRF_B = "csrf_token_bbbbbbbbbbbbbbbbbbbb";
const NOTIF_ID = "n_abcdefgh12345678";

describe("HttpApiClient on web (cookie session)", () => {
  it("sends credentials and never an Authorization header or a stored token", async () => {
    const { client, calls, store } = makeClient(() => jsonResponse(USER));
    await client.getMe();
    expect(calls[0]?.url).toBe(`${BASE}/v1/me`);
    expect(calls[0]?.credentials).toBe("include");
    expect(calls[0]?.headers.authorization).toBeUndefined();
    expect(store.gets).toBe(0);
  });

  it("fetches the CSRF token once, keeps it in memory and sends it on writes only", async () => {
    const { client, calls } = makeClient((req) => {
      if (req.path === "/auth/csrf") return jsonResponse({ csrfToken: CSRF_A });
      return new Response(null, { status: 204 });
    });
    await client.getMe().catch(() => undefined);
    expect(calls.some((c) => c.headers["x-csrf-token"])).toBe(false);

    await client.markNotificationDone(NOTIF_ID);
    await client.snoozeNotification(NOTIF_ID, NOW);

    const csrfFetches = calls.filter((c) => c.path === "/auth/csrf");
    expect(csrfFetches).toHaveLength(1);
    const writes = calls.filter((c) => c.method === "POST");
    expect(writes).toHaveLength(2);
    expect(writes.every((w) => w.headers["x-csrf-token"] === CSRF_A && w.credentials === "include")).toBe(true);
    expect(getInMemoryCsrfToken()).toBe(CSRF_A);
  });

  it("refetches the CSRF token and retries a refused write exactly once", async () => {
    let csrf = CSRF_A;
    let posts = 0;
    const { client, calls } = makeClient((req) => {
      if (req.path === "/auth/csrf") return jsonResponse({ csrfToken: csrf });
      posts++;
      if (req.headers["x-csrf-token"] !== CSRF_B) return errorResponse("forbidden", 403, "Missing or invalid CSRF token.");
      return new Response(null, { status: 204 });
    });
    await client.getCsrfToken(); // loads CSRF_A
    csrf = CSRF_B; // the server rotated it (for example after a session refresh)

    await client.markNotificationDone(NOTIF_ID);

    expect(posts).toBe(2);
    const sent = calls.filter((c) => c.method === "POST").map((c) => c.headers["x-csrf-token"]);
    expect(sent).toEqual([CSRF_A, CSRF_B]);
    expect(getInMemoryCsrfToken()).toBe(CSRF_B);
  });

  it("shows the error when the retry is refused too", async () => {
    let n = 0;
    const { client, calls } = makeClient((req) => {
      if (req.path === "/auth/csrf") return jsonResponse({ csrfToken: n++ === 0 ? CSRF_A : CSRF_B });
      return errorResponse("forbidden", 403, "Missing or invalid CSRF token.");
    });
    const failure = await client.markNotificationDone(NOTIF_ID).catch((e) => e);
    expect(failure).toBeInstanceOf(ApiClientError);
    expect(failure.code).toBe("forbidden");
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(2);
  });

  it("does not retry a refusal that is not about CSRF (the token did not change)", async () => {
    const { client, calls } = makeClient((req) => {
      if (req.path === "/auth/csrf") return jsonResponse({ csrfToken: CSRF_A });
      return errorResponse("forbidden", 403, "Not available in the demo.");
    });
    const failure = await client.markNotificationDone(NOTIF_ID).catch((e) => e);
    expect(failure.code).toBe("forbidden");
    expect(failure.message).toBe("Not available in the demo.");
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);
  });

  it("rejects mixed web/bearer sign-in answers without adopting either credential", async () => {
    const { client, store } = makeClient(() =>
      jsonResponse({
        session: { token: "should_never_be_kept_xxxxxxxxxx", expiresAt: NOW, csrfToken: CSRF_A },
        user: USER,
      }),
    );
    await expect(client.completeGithubAuth("code123", "state123", "v".repeat(43))).rejects.toMatchObject({code:"parse_failed"});
    expect(store.sets).toEqual([]);
    expect(getInMemoryCsrfToken()).toBeNull();
  });

  it("clears the CSRF token and tells the app on 401", async () => {
    const { client } = makeClient(() => errorResponse("unauthorized", 401));
    setInMemoryCsrfToken(CSRF_A);
    const handler = vi.fn();
    client.setUnauthorizedHandler(handler);
    await expect(client.getNotifications()).rejects.toMatchObject({ code: "unauthorized" });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(getInMemoryCsrfToken()).toBeNull();
  });

  it("checking who is signed in (getMe) does not raise the session-ended handler", async () => {
    const { client } = makeClient(() => errorResponse("unauthorized", 401));
    const handler = vi.fn();
    client.setUnauthorizedHandler(handler);
    await expect(client.getMe()).rejects.toMatchObject({ code: "unauthorized" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("sends the demo bot-check token and the web platform", async () => {
    const getTurnstileToken = vi.fn(async () => "turnstile_ok");
    const { client, calls } = makeClient(
      () => jsonResponse({ session: { expiresAt: NOW, csrfToken: CSRF_A, demo: true }, user: USER }),
      { getTurnstileToken },
    );
    const res = await client.startDemoSession();
    expect(calls[0]?.path).toBe("/auth/demo");
    expect(calls[0]?.body).toEqual({ turnstileToken: "turnstile_ok", platform: "web" });
    expect(res.session).toEqual({ expiresAt: NOW, demo: true });
  });

  it("explains when no bot check is available for the demo", async () => {
    const { client, calls } = makeClient(() => jsonResponse({}));
    await expect(client.startDemoSession()).rejects.toMatchObject({ code: "bot_check_unavailable" });
    expect(calls).toHaveLength(0);
  });

  it("refreshes the CSRF token together with the cookie session", async () => {
    const { client } = makeClient((req) => {
      if (req.path === "/auth/csrf") return jsonResponse({ csrfToken: CSRF_A });
      return jsonResponse({ session: { expiresAt: NOW, csrfToken: CSRF_B } });
    });
    await client.getCsrfToken();
    const session = await client.refreshSession();
    expect(session).toEqual({ expiresAt: NOW });
    expect(getInMemoryCsrfToken()).toBe(CSRF_B);
  });

  it("only offers checkout and portal on web, and only Stripe links", async () => {
    const { client } = makeClient((req) => {
      if (req.path === "/auth/csrf") return jsonResponse({ csrfToken: CSRF_A });
      if (req.path === "/billing/checkout") return jsonResponse({ url: "https://checkout.stripe.com/c/pay/cs_test" });
      return jsonResponse({ url: "https://evil.example.com/portal" });
    });
    await expect(client.createCheckoutSession("pro_monthly")).resolves.toEqual({
      url: "https://checkout.stripe.com/c/pay/cs_test",
    });
    await expect(client.createPortalSession()).rejects.toMatchObject({ code: "parse_failed" });
  });

  it("saves and removes the Meta key on web, sending the key once and never reading it back", async () => {
    const { client, calls } = makeClient((req) => {
      if (req.path === "/auth/csrf") return jsonResponse({ csrfToken: CSRF_A });
      if (req.method === "DELETE") return new Response(null, { status: 204 });
      return jsonResponse({ configured: true });
    });
    const sampleKey = "test-only-".repeat(3);
    await client.saveMetaKey(`  ${sampleKey}  `);
    await client.removeMetaKey();
    const put = calls.find((c) => c.method === "PUT");
    expect(put?.path).toBe("/settings/meta-key");
    expect(put?.body).toEqual({ key: sampleKey });
    expect(calls.find((c) => c.method === "DELETE")?.headers["x-csrf-token"]).toBe(CSRF_A);

    await expect(client.saveMetaKey("short")).rejects.toMatchObject({ code: "validation_failed" });
  });

  it("treats an API without the Meta key feature as not offered", async () => {
    const { client } = makeClient(() => errorResponse("not_found", 404, "Not found."));
    await expect(client.getMetaKeyStatus()).resolves.toBeNull();
  });

  it("uses a memory store the web client never writes to", async () => {
    const store = new MemoryTokenStore("native_leftover_token_xxxxxxxx");
    const { client } = makeClient(() => jsonResponse(USER), { tokenStore: store });
    await client.getMe();
    expect(store.gets).toBe(0);
    expect(store.sets).toEqual([]);
  });

  it("enforces aria-checked on billing plan radio controls for WCAG accessibility", () => {
    const billingSource = fs.readFileSync(path.resolve(__dirname, "../app/billing/index.tsx"), "utf8");
    expect(billingSource).toContain('checked: billingCycle === "monthly"');
    expect(billingSource).toContain('checked: billingCycle === "annual"');
  });
});
