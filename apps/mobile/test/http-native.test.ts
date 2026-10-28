import { describe, it, expect, vi } from "vitest";
import { getInMemoryCsrfToken } from "../src/api/client";
import { MemoryTokenStore, NOW, USER, errorResponse, jsonResponse, makeClient } from "./helpers";

const TOKEN_1 = "native_session_token_1_aaaaaaaaaaaa";
const TOKEN_2 = "native_session_token_2_bbbbbbbbbbbb";
const NOTIF_ID = "n_abcdefgh12345678";

const native = (handler: Parameters<typeof makeClient>[0], token: string | null = TOKEN_1) =>
  makeClient(handler, { platform: "native", token });

describe("HttpApiClient on native (bearer session)", () => {
  it("sends the stored token as a Bearer header, without cookies or CSRF", async () => {
    const { client, calls } = native(() => new Response(null, { status: 204 }));
    await client.markNotificationDone(NOTIF_ID);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.headers.authorization).toBe(`Bearer ${TOKEN_1}`);
    expect(calls[0]?.headers["x-csrf-token"]).toBeUndefined();
    expect(calls[0]?.credentials).toBe("omit");
  });

  it("never asks for a CSRF token", async () => {
    const { client, calls } = native(() => jsonResponse({}));
    await expect(client.getCsrfToken()).rejects.toMatchObject({ code: "not_found" });
    expect(calls).toHaveLength(0);
    expect(getInMemoryCsrfToken()).toBeNull();
  });

  it("stores the token from sign-in in secure storage and hands the screens a session without it", async () => {
    const { client, store, calls } = native(
      () => jsonResponse({ session: { token: TOKEN_1, expiresAt: NOW }, user: USER }),
      null,
    );
    const res = await client.completeGithubAuth("code123", "state123", "v".repeat(43));
    expect(store.sets).toEqual([TOKEN_1]);
    expect(res.session).toEqual({ expiresAt: NOW });
    // Public endpoint: no Authorization header is sent.
    expect(calls[0]?.headers.authorization).toBeUndefined();
  });

  it("rotates the token when the API returns a new one, and uses it from then on", async () => {
    const { client, store, calls } = native((req) => {
      if (req.path === "/auth/refresh") return jsonResponse({ session: { token: TOKEN_2, expiresAt: NOW } });
      return jsonResponse(USER);
    });
    const session = await client.refreshSession();
    expect(session).toEqual({ expiresAt: NOW });
    expect(store.token).toBe(TOKEN_2);

    await client.getMe();
    expect(calls[0]?.headers.authorization).toBe(`Bearer ${TOKEN_1}`);
    expect(calls[1]?.headers.authorization).toBe(`Bearer ${TOKEN_2}`);
  });

  it("makes requests wait for a refresh in flight so they carry the new token", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { client, calls } = native(async (req) => {
      if (req.path === "/auth/refresh") {
        await gate;
        return jsonResponse({ session: { token: TOKEN_2, expiresAt: NOW } });
      }
      return jsonResponse(USER);
    });
    const refresh = client.refreshSession();
    const me = client.getMe();
    await new Promise((r) => setTimeout(r, 10));
    expect(calls.map((c) => c.path)).toEqual(["/auth/refresh"]);
    release();
    await Promise.all([refresh, me]);
    expect(calls[1]?.headers.authorization).toBe(`Bearer ${TOKEN_2}`);
  });

  it("shares one refresh between callers", async () => {
    const { client, calls } = native(() => jsonResponse({ session: { token: TOKEN_2, expiresAt: NOW } }));
    await Promise.all([client.refreshSession(), client.refreshSession()]);
    expect(calls.filter((c) => c.path === "/auth/refresh")).toHaveLength(1);
  });

  it("retries once with the rotated token instead of signing out when a request raced the rotation", async () => {
    const store = new MemoryTokenStore(TOKEN_1);
    const { client, calls } = makeClient(
      (req) => {
        if (req.headers.authorization === `Bearer ${TOKEN_1}`) {
          store.token = TOKEN_2; // the rotation lands while this request is in flight
          return errorResponse("unauthorized", 401);
        }
        return jsonResponse(USER);
      },
      { platform: "native", tokenStore: store },
    );
    await expect(client.getMe()).resolves.toEqual(USER);
    expect(calls.map((c) => c.headers.authorization)).toEqual([`Bearer ${TOKEN_1}`, `Bearer ${TOKEN_2}`]);
    expect(store.clears).toBe(0);
  });

  it("clears the token and tells the app on 401", async () => {
    const { client, store } = native(() => errorResponse("unauthorized", 401));
    const handler = vi.fn();
    client.setUnauthorizedHandler(handler);
    await expect(client.getNotifications()).rejects.toMatchObject({ code: "unauthorized" });
    expect(store.token).toBeNull();
    expect(store.clears).toBe(1);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("clears an invalid token found while checking who is signed in, without raising the handler", async () => {
    const { client, store } = native(() => errorResponse("unauthorized", 401));
    const handler = vi.fn();
    client.setUnauthorizedHandler(handler);
    await expect(client.getMe()).rejects.toMatchObject({ code: "unauthorized" });
    expect(store.token).toBeNull();
    expect(handler).not.toHaveBeenCalled();
  });

  it("does not call the network without a token", async () => {
    const { client, calls } = native(() => jsonResponse(USER), null);
    const handler = vi.fn();
    client.setUnauthorizedHandler(handler);
    await expect(client.getNotifications()).rejects.toMatchObject({ code: "unauthorized" });
    expect(calls).toHaveLength(0);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("clears the token on logout even when the API call fails", async () => {
    const { client, store } = native(() => errorResponse("internal", 500));
    await expect(client.logout()).rejects.toMatchObject({ code: "internal" });
    expect(store.token).toBeNull();
  });

  it("clears the token after the account is deleted", async () => {
    const { client, store, calls } = native(() => new Response(null, { status: 204 }));
    await client.deleteAccount();
    expect(calls[0]?.method).toBe("DELETE");
    expect(calls[0]?.path).toBe("/account");
    expect(store.token).toBeNull();
  });

  it("sends the ios platform for sign-in and demo", async () => {
    const { client, calls } = makeClient(
      () => jsonResponse({ session: { token: TOKEN_1, expiresAt: NOW, demo: true }, user: USER }),
      { platform: "native", getTurnstileToken: async () => "t" },
    );
    await client.startDemoSession();
    expect(calls[0]?.body).toEqual({ turnstileToken: "t", platform: "ios" });
  });

  it("registers and removes the push token for a device", async () => {
    const { client, calls } = native((req) =>
      req.method === "POST" ? jsonResponse({ registered: true }, 201) : new Response(null, { status: 204 }),
    );
    await client.registerPushToken("device_abc12345", "ExponentPushToken[abc]");
    await client.unregisterPushToken("device_abc12345");
    expect(calls[0]?.body).toEqual({ deviceId: "device_abc12345", token: "ExponentPushToken[abc]" });
    expect(calls[1]?.method).toBe("DELETE");
    expect(calls[1]?.body).toEqual({ deviceId: "device_abc12345" });
  });

  it("reads the Meta key status on native but cannot change the key", async () => {
    const { client, calls } = native(() => jsonResponse({ configured: true }));
    await expect(client.getMetaKeyStatus()).resolves.toEqual({ configured: true });
    await expect(client.saveMetaKey("abcdefghijklmnop1234")).rejects.toMatchObject({ code: "forbidden" });
    await expect(client.removeMetaKey()).rejects.toMatchObject({ code: "forbidden" });
    expect(calls).toHaveLength(1);
  });

  it("keeps checkout and portal off native", async () => {
    const { client, calls } = native(() => jsonResponse({}));
    await expect(client.createCheckoutSession("pro_annual")).rejects.toMatchObject({ code: "forbidden" });
    await expect(client.createPortalSession()).rejects.toMatchObject({ code: "forbidden" });
    expect(calls).toHaveLength(0);
  });

  it("reads the billing plan with the bearer token", async () => {
    const { client } = native(() => jsonResponse({ plan: "pro", status: "active", renewsAt: NOW, cancelAt: null, trialEligible: false, canManage: true }));
    await expect(client.getBillingPlan()).resolves.toEqual({ plan: "pro", status: "active", renewsAt: NOW, trialEligible: false, canManage: true });
  });
});
