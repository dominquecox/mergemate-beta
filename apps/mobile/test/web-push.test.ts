import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash, randomBytes } from "node:crypto";

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => undefined),
  deleteItemAsync: vi.fn(async () => undefined),
}));

import { MockApiClient } from "../src/api/mock";
import {
  disableWebPush,
  dropWebPush,
  enableWebPush,
  refreshWebPush,
  webPushStatus,
  type BrowserSubscription,
  type WebPushDevice,
} from "../src/push/web";
import { registerServiceWorker, resetServiceWorkerRegistration } from "../src/platform/serviceWorker";

const b64url = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");
const PUBLIC_KEY = b64url(new Uint8Array([4, ...randomBytes(64)]));

/** An in-memory browser: permission, one service worker registration and at most one push subscription. */
function fakeBrowser(over: { permission?: "granted" | "denied" | "default"; ios?: boolean; standalone?: boolean; supported?: boolean } = {}) {
  const state = {
    permission: over.permission ?? "default",
    owner: null as string | null,
    registered: false,
    subscription: null as (BrowserSubscription & { active: boolean }) | null,
    prompts: 0,
    registrations: 0,
    unsubscribeWorks: true,
  };
  const makeSubscription = () => {
    const endpoint = `https://fcm.googleapis.com/fcm/send/${b64url(randomBytes(12))}`;
    const sub = {
      endpoint,
      active: true,
      toJSON: () => ({ endpoint, keys: { p256dh: PUBLIC_KEY, auth: b64url(randomBytes(16)) } }),
      unsubscribe: async () => {
        if (!state.unsubscribeWorks) return false;
        sub.active = false;
        state.subscription = null;
        return true;
      },
    };
    return sub;
  };
  const device: WebPushDevice = {
    supported: () => over.supported ?? true,
    isIos: () => over.ios ?? false,
    isStandalone: () => over.standalone ?? false,
    permission: () => state.permission,
    requestPermission: async () => {
      state.prompts++;
      if (state.permission === "default") state.permission = "granted";
      return state.permission;
    },
    registration: async (register) => {
      if (register && !state.registered) {
        state.registered = true;
        state.registrations++;
      }
      if (!state.registered) return null;
      return {
        pushManager: {
          getSubscription: async () => state.subscription,
          subscribe: async () => (state.subscription = makeSubscription()),
        },
      };
    },
    sha256: async (text) => new Uint8Array(createHash("sha256").update(text).digest()),
    enabledFor: () => state.owner,
    setEnabledFor: (id) => {
      state.owner = id;
    },
  };
  return { device, state };
}

function fakeApi() {
  const api = new MockApiClient();
  const calls = { register: [] as string[], unregister: [] as string[] };
  vi.spyOn(api, "getWebPushKey").mockResolvedValue(PUBLIC_KEY);
  vi.spyOn(api, "registerWebPush").mockImplementation(async (...args: unknown[]) => {
    calls.register.push(String(args[0]));
  });
  vi.spyOn(api, "unregisterWebPush").mockImplementation(async (...args: unknown[]) => {
    calls.unregister.push(String(args[0]));
  });
  return { api, calls };
}

describe("browser notifications: status and permission", () => {
  it("reading the status never prompts or registers a service worker", async () => {
    const { device, state } = fakeBrowser();
    expect(await webPushStatus(device, "u1")).toBe("off");
    expect(state.prompts).toBe(0);
    expect(state.registrations).toBe(0);
  });

  it("reports blocked, install-first on iPhone Safari, and unsupported browsers without prompting", async () => {
    expect(await webPushStatus(fakeBrowser({ permission: "denied" }).device, "u1")).toBe("blocked");
    expect(await webPushStatus(fakeBrowser({ ios: true, standalone: false }).device, "u1")).toBe("install-first");
    expect(await webPushStatus(fakeBrowser({ supported: false }).device, "u1")).toBe("unsupported");
    const { api } = fakeApi();
    const ios = fakeBrowser({ ios: true, standalone: false });
    expect(await enableWebPush(api, "u1", ios.device)).toBe("install-first");
    expect(ios.state.prompts).toBe(0);
  });

  it("a declined prompt stays off and never subscribes", async () => {
    const { api, calls } = fakeApi();
    const { device, state } = fakeBrowser();
    device.requestPermission = async () => {
      state.prompts++;
      state.permission = "denied";
      return "denied";
    };
    expect(await enableWebPush(api, "u1", device)).toBe("blocked");
    expect(state.subscription).toBeNull();
    expect(calls.register).toEqual([]);
  });
});

describe("browser notifications: turning on and off", () => {
  let api: MockApiClient;
  let calls: { register: string[]; unregister: string[] };
  beforeEach(() => ({ api, calls } = fakeApi()));

  it("turning on prompts once, registers one worker and one subscription, and is idempotent", async () => {
    const { device, state } = fakeBrowser();
    expect(await enableWebPush(api, "u1", device)).toBe("enabled");
    expect(await enableWebPush(api, "u1", device)).toBe("enabled");
    expect(state.prompts).toBe(1);
    expect(state.registrations).toBe(1);
    expect(calls.register).toHaveLength(2);
    expect(new Set(calls.register).size).toBe(1);
    expect(await webPushStatus(device, "u1")).toBe("on");
  });

  it("is off when the API offers no key, without subscribing", async () => {
    vi.mocked(api.getWebPushKey).mockResolvedValue(null);
    const { device, state } = fakeBrowser({ permission: "granted" });
    expect(await enableWebPush(api, "u1", device)).toBe("unavailable");
    expect(state.subscription).toBeNull();
  });

  it("removes a new browser subscription when the server rejects it", async () => {
    vi.mocked(api.registerWebPush).mockRejectedValue(new Error("forbidden"));
    const { device, state } = fakeBrowser();
    await expect(enableWebPush(api, "u1", device)).rejects.toThrow("forbidden");
    expect(state.subscription).toBeNull();
    expect(state.owner).toBeNull();
  });

  it("turning off removes the server row and the browser subscription", async () => {
    const { device, state } = fakeBrowser();
    await enableWebPush(api, "u1", device);
    await disableWebPush(api, device);
    expect(calls.unregister).toEqual([calls.register[0]]);
    expect(state.subscription).toBeNull();
    expect(state.owner).toBeNull();
    expect(await webPushStatus(device, "u1")).toBe("off");
  });

  it("turning off still stops this browser when the server call fails", async () => {
    const { device, state } = fakeBrowser();
    await enableWebPush(api, "u1", device);
    vi.mocked(api.unregisterWebPush).mockRejectedValue(new Error("network"));
    await disableWebPush(api, device);
    expect(state.subscription).toBeNull();
    expect(state.owner).toBeNull();
  });

  it("reports a failure (and stays on) when the browser cannot unsubscribe", async () => {
    const { device, state } = fakeBrowser();
    await enableWebPush(api, "u1", device);
    state.unsubscribeWorks = false;
    await expect(disableWebPush(api, device)).rejects.toThrow("couldn't turn notifications off");
    expect(state.owner).toBe("u1");
    expect(await webPushStatus(device, "u1")).toBe("on");
  });
});

describe("browser notifications: sessions and shared browsers", () => {
  it("keeps the same person's browser registered after a new session, without prompting", async () => {
    const { api, calls } = fakeApi();
    const { device, state } = fakeBrowser();
    await enableWebPush(api, "u1", device);
    await refreshWebPush(api, "u1", device);
    expect(calls.register).toHaveLength(2);
    expect(state.prompts).toBe(1);
    expect(state.subscription?.active).toBe(true);
  });

  it("removes the previous person's subscription when someone else signs in", async () => {
    const { api, calls } = fakeApi();
    const { device, state } = fakeBrowser();
    await enableWebPush(api, "alice", device);
    await refreshWebPush(api, "bob", device);
    expect(state.subscription).toBeNull();
    expect(state.owner).toBeNull();
    expect(calls.register).toHaveLength(1);
    expect(await webPushStatus(device, "bob")).toBe("off");
  });

  it("removes the subscription when notification permission was withdrawn", async () => {
    const { api, calls } = fakeApi();
    const { device, state } = fakeBrowser();
    await enableWebPush(api, "u1", device);
    state.permission = "default";
    await refreshWebPush(api, "u1", device);
    expect(state.subscription).toBeNull();
    expect(calls.register).toHaveLength(1);
  });

  it("dropping after a session ends stops the browser without an API call", async () => {
    const { api, calls } = fakeApi();
    const { device, state } = fakeBrowser();
    await enableWebPush(api, "u1", device);
    await dropWebPush(device);
    expect(state.subscription).toBeNull();
    expect(state.owner).toBeNull();
    expect(calls.unregister).toEqual([]);
  });
});

describe("service worker registration", () => {
  beforeEach(() => resetServiceWorkerRegistration());

  it("registers /sw.js once per page with scope / and no HTTP-cached worker script", async () => {
    const register = vi.fn(async () => ({}));
    const host = { navigator: { serviceWorker: { register } }, isSecureContext: true };
    expect(await Promise.all([registerServiceWorker(host), registerServiceWorker(host)])).toEqual([true, true]);
    expect(await registerServiceWorker(host)).toBe(true);
    expect(register).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/", updateViaCache: "none" });
  });

  it("skips browsers without service workers and insecure pages", async () => {
    expect(await registerServiceWorker({ navigator: {} })).toBe(false);
    const register = vi.fn(async () => ({}));
    expect(await registerServiceWorker({ navigator: { serviceWorker: { register } }, isSecureContext: false })).toBe(false);
    expect(register).not.toHaveBeenCalled();
  });

  it("can try again after a failed registration", async () => {
    const register = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({});
    const host = { navigator: { serviceWorker: { register } } };
    expect(await registerServiceWorker(host)).toBe(false);
    expect(await registerServiceWorker(host)).toBe(true);
    expect(register).toHaveBeenCalledTimes(2);
  });
});
