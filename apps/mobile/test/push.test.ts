import { describe, it, expect, vi, beforeEach } from "vitest";
import { randomBytes } from "node:crypto";
import { ExpoPushToken } from "@mergemate/contracts";

const secure = new Map<string, string>();
vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async (key: string) => secure.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, val: string) => {
    secure.set(key, val);
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    secure.delete(key);
  }),
}));

import { Platform } from "react-native";
import { MockApiClient } from "../src/api/mock";
import { StorageService, PENDING_SIGN_IN_TTL_MS } from "../src/storage";
import { refreshPushRegistration, registerPush, unregisterPush, type PushDevice } from "../src/push/registration";

const device = (over: Partial<PushDevice> = {}): PushDevice => ({
  isNative: true,
  projectId: "project-id",
  getPermission: async () => "granted",
  requestPermission: async () => "granted",
  getExpoPushToken: async () => "ExponentPushToken[abc123]",
  randomBytes: (n) => new Uint8Array(randomBytes(n)),
  ...over,
});

beforeEach(() => {
  secure.clear();
  (Platform as { OS: string }).OS = "ios";
});

describe("push token registration (native)", () => {
  it("registers an Expo push token with a stable device id", async () => {
    const api = new MockApiClient();
    const register = vi.spyOn(api, "registerPushToken");
    expect(await registerPush(api, { prompt: true }, device())).toBe("registered");
    expect(await registerPush(api, { prompt: true }, device())).toBe("registered");

    const [first, second] = register.mock.calls;
    expect(first?.[0]).toMatch(/^[A-Za-z0-9_-]{8,128}$/);
    expect(second?.[0]).toBe(first?.[0]);
    expect(ExpoPushToken.safeParse(first?.[1]).success).toBe(true);
    expect(await StorageService.getPushEnabled()).toBe(true);
  });

  it("asks for permission only when allowed to, and stops if it is refused", async () => {
    const api = new MockApiClient();
    const register = vi.spyOn(api, "registerPushToken");
    const request = vi.fn(async () => "denied" as const);

    const silent = device({ getPermission: async () => "undetermined", requestPermission: request });
    expect(await registerPush(api, { prompt: false }, silent)).toBe("denied");
    expect(request).not.toHaveBeenCalled();

    expect(await registerPush(api, { prompt: true }, silent)).toBe("denied");
    expect(request).toHaveBeenCalledTimes(1);
    expect(register).not.toHaveBeenCalled();
  });

  it("reports unavailable without an EAS project id or off native", async () => {
    const api = new MockApiClient();
    expect(await registerPush(api, { prompt: true }, device({ projectId: null }))).toBe("unavailable");
    expect(await registerPush(api, { prompt: true }, device({ isNative: false }))).toBe("unavailable");
  });

  it("removes the registration for this device", async () => {
    const api = new MockApiClient();
    const remove = vi.spyOn(api, "unregisterPushToken");
    await registerPush(api, { prompt: true }, device());
    await unregisterPush(api);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(await StorageService.getPushEnabled()).toBe(false);
  });

  it("re-registers silently only for a device that turned push on", async () => {
    const api = new MockApiClient();
    const register = vi.spyOn(api, "registerPushToken");
    await refreshPushRegistration(api, device());
    expect(register).not.toHaveBeenCalled();

    await StorageService.setPushEnabled(true);
    await refreshPushRegistration(api, device());
    expect(register).toHaveBeenCalledTimes(1);
  });

  it("ensures the Android notification channel before requesting runtime permission", async () => {
    (Platform as { OS: string }).OS = "android";
    const api = new MockApiClient();
    const order: string[] = [];
    const androidDevice = device({
      ensureNotificationChannel: vi.fn(async () => {
        order.push("channel");
      }),
      getPermission: async () => "undetermined",
      requestPermission: vi.fn(async () => {
        order.push("permission");
        return "granted" as const;
      }),
    });
    expect(await registerPush(api, { prompt: true }, androidDevice)).toBe("registered");
    expect(order).toEqual(["channel", "permission"]);
  });
});

describe("sign-in in progress", () => {
  it("is read once, then gone", async () => {
    await StorageService.setPendingSignIn({ state: "s1", verifier: "v".repeat(43), createdAt: Date.now() });
    expect((await StorageService.takePendingSignIn())?.state).toBe("s1");
    expect(await StorageService.takePendingSignIn()).toBeNull();
  });

  it("expires after ten minutes", async () => {
    await StorageService.setPendingSignIn({ state: "s1", verifier: "v".repeat(43), createdAt: 1000 });
    expect(await StorageService.takePendingSignIn(1000 + PENDING_SIGN_IN_TTL_MS + 1)).toBeNull();
  });

  it("rejects a future-dated pending sign-in", async () => {
    await StorageService.setPendingSignIn({ state: "s1", verifier: "v".repeat(43), createdAt: 2000 });
    expect(await StorageService.takePendingSignIn(1000)).toBeNull();
  });

  it("ignores damaged data", async () => {
    secure.set("mergemate_pending_sign_in", "{not json");
    expect(await StorageService.takePendingSignIn()).toBeNull();
  });

  it("remembers whether the session is a demo", async () => {
    expect(await StorageService.getDemoFlag()).toBe(false);
    await StorageService.setDemoFlag(true);
    expect(await StorageService.getDemoFlag()).toBe(true);
    await StorageService.setDemoFlag(false);
    expect(await StorageService.getDemoFlag()).toBe(false);
  });
});
