import type { ApiClient } from "../api/client";
import { registerServiceWorker } from "../platform/serviceWorker";

/**
 * Browser notifications (Web Push) for the web app. Nothing here runs until the person taps the switch in
 * Settings: the permission prompt, the service worker registration and the subscription all happen on that tap.
 * The browser's own subscription is the source of truth, so no token or secret is kept in web storage; the only
 * thing stored is which signed-in person turned it on (a user id), so a different person signing in on a shared
 * browser is not subscribed silently.
 */
export type WebPushStatus = "unsupported" | "install-first" | "blocked" | "off" | "on";
export type WebPushResult = "enabled" | "blocked" | "install-first" | "unsupported" | "unavailable";

/** The parts of a push subscription this module reads. */
export interface BrowserSubscription {
  endpoint: string;
  toJSON(): { endpoint?: string | undefined; keys?: { p256dh?: string | undefined; auth?: string | undefined } | undefined };
  unsubscribe(): Promise<boolean>;
}
export interface BrowserRegistration {
  pushManager: {
    getSubscription(): Promise<BrowserSubscription | null>;
    subscribe(options: { userVisibleOnly: true; applicationServerKey: Uint8Array }): Promise<BrowserSubscription>;
  };
}

/** What the browser provides, injected so it can be tested without one. */
export interface WebPushDevice {
  supported(): boolean;
  isIos(): boolean;
  isStandalone(): boolean;
  permission(): "granted" | "denied" | "default";
  requestPermission(): Promise<"granted" | "denied" | "default">;
  /** Registers (or returns) the service worker and waits until it is active. */
  registration(register: boolean): Promise<BrowserRegistration | null>;
  sha256(text: string): Promise<Uint8Array>;
  enabledFor(): string | null;
  setEnabledFor(userId: string | null): void;
}

export function browserDevice(): WebPushDevice {
  const g = globalThis as unknown as {
    navigator?: Navigator & { standalone?: boolean };
    Notification?: { permission: NotificationPermission; requestPermission(): Promise<NotificationPermission> };
    localStorage?: Storage;
    matchMedia?: (query: string) => { matches: boolean };
  };
  const KEY = "mergemate.webPushUser";
  return {
    supported: () => !!g.navigator && "serviceWorker" in g.navigator && "PushManager" in globalThis && !!g.Notification,
    isIos: () => /iphone|ipad|ipod/i.test(g.navigator?.userAgent ?? "") || (g.navigator?.platform === "MacIntel" && (g.navigator?.maxTouchPoints ?? 0) > 1),
    isStandalone: () => g.navigator?.standalone === true || g.matchMedia?.("(display-mode: standalone)").matches === true,
    permission: () => g.Notification?.permission ?? "denied",
    requestPermission: async () => (await g.Notification?.requestPermission()) ?? "denied",
    async registration(register) {
      const container = g.navigator?.serviceWorker;
      if (!container) return null;
      if (register && !(await registerServiceWorker())) return null;
      return ((await container.getRegistration("/")) ?? null) && ((await container.ready) as unknown as BrowserRegistration);
    },
    async sha256(text) {
      return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
    },
    enabledFor() {
      try { return g.localStorage?.getItem(KEY) ?? null; } catch { return null; }
    },
    setEnabledFor(userId) {
      try { if (userId) g.localStorage?.setItem(KEY, userId); else g.localStorage?.removeItem(KEY); } catch { /* storage unavailable */ }
    },
  };
}

const base64UrlToBytes = (value: string): Uint8Array => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
};
const bytesToBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** A stable id for this browser's subscription, so nothing needs to be stored to remove it later. */
async function deviceIdFor(device: WebPushDevice, endpoint: string): Promise<string> {
  return bytesToBase64Url((await device.sha256(endpoint)).slice(0, 18));
}

async function register(api: ApiClient, device: WebPushDevice, subscription: BrowserSubscription): Promise<void> {
  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!json.endpoint || !p256dh || !auth) throw new Error("The browser returned an incomplete subscription.");
  await api.registerWebPush(await deviceIdFor(device, json.endpoint), { endpoint: json.endpoint, keys: { p256dh, auth } });
}

/** Where the switch stands. Never prompts and never registers anything. */
export async function webPushStatus(device: WebPushDevice, userId: string): Promise<WebPushStatus> {
  if (!device.supported()) return device.isIos() && !device.isStandalone() ? "install-first" : "unsupported";
  if (device.isIos() && !device.isStandalone()) return "install-first";
  if (device.permission() === "denied") return "blocked";
  if (device.permission() !== "granted" || device.enabledFor() !== userId) return "off";
  const registration = await device.registration(false);
  return (await registration?.pushManager.getSubscription()) ? "on" : "off";
}

/** Turns browser notifications on. Call it straight from the tap: Safari only prompts inside a user gesture. */
export async function enableWebPush(api: ApiClient, userId: string, device: WebPushDevice = browserDevice()): Promise<WebPushResult> {
  if (!device.supported()) return device.isIos() && !device.isStandalone() ? "install-first" : "unsupported";
  if (device.isIos() && !device.isStandalone()) return "install-first";
  if (device.permission() !== "granted" && (await device.requestPermission()) !== "granted") return "blocked";
  const publicKey = await api.getWebPushKey();
  if (!publicKey) return "unavailable";
  const registration = await device.registration(true);
  if (!registration) return "unsupported";
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey) }));
  try {
    await register(api, device, subscription);
  } catch (error) {
    if (!existing) await subscription.unsubscribe().catch(() => false);
    throw error;
  }
  device.setEnabledFor(userId);
  return "enabled";
}

/**
 * Turns it off here: removes the server row, then the browser subscription. The browser subscription is what
 * delivers, so once it is gone notifications stop even if the server call failed (the server drops the row on the
 * next send, when the push service answers 404/410). Throws only when the browser could not unsubscribe.
 */
export async function disableWebPush(api: ApiClient, device: WebPushDevice = browserDevice()): Promise<void> {
  if (!device.supported()) {
    device.setEnabledFor(null);
    return;
  }
  const subscription = await (await device.registration(false))?.pushManager.getSubscription();
  if (!subscription) {
    device.setEnabledFor(null);
    return;
  }
  try {
    await api.unregisterWebPush(await deviceIdFor(device, subscription.endpoint));
  } catch {
    // Not fatal: removing the browser subscription below is what stops delivery.
  }
  if (!(await subscription.unsubscribe().catch(() => false))) {
    throw new Error("This browser couldn't turn notifications off. Try again.");
  }
  device.setEnabledFor(null);
}

/**
 * Removes this browser's subscription without an API call, for when the session is already gone (it ended, or
 * someone else is signing in). The server row went with the session; this stops the browser itself.
 */
export async function dropWebPush(device: WebPushDevice = browserDevice()): Promise<void> {
  device.setEnabledFor(null);
  if (!device.supported()) return;
  const subscription = await (await device.registration(false))?.pushManager.getSubscription();
  await subscription?.unsubscribe().catch(() => false);
}

/**
 * After sign-in or a new session: keeps a browser the person already turned on registered. Never prompts.
 * A subscription left by someone else on this browser (or one whose permission was withdrawn) is removed, so a
 * shared browser never shows the previous person's notifications.
 */
export async function refreshWebPush(api: ApiClient, userId: string, device: WebPushDevice = browserDevice()): Promise<void> {
  if (!device.supported()) return;
  const owner = device.enabledFor();
  const subscription = await (await device.registration(false))?.pushManager.getSubscription();
  if (owner !== userId || device.permission() !== "granted") {
    if (subscription || owner) await dropWebPush(device);
    return;
  }
  if (subscription) await register(api, device, subscription);
  else device.setEnabledFor(null);
}
