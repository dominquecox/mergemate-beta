import { createDeviceId } from "../auth/pkce";
import type { ApiClient } from "../api/client";
import { StorageService } from "../storage";

export type PushResult = "registered" | "denied" | "unavailable";

/** What the registration needs from the device. Injected so it can be tested without native modules. */
export interface PushDevice {
  isNative: boolean;
  /** EAS project id, set by the owner in the Expo config. Without it Expo cannot issue a push token. */
  projectId: string | null;
  getPermission(): Promise<"granted" | "denied" | "undetermined">;
  requestPermission(): Promise<"granted" | "denied">;
  getExpoPushToken(projectId: string): Promise<string>;
  randomBytes(count: number): Uint8Array;
}

export function expoPushDevice(): PushDevice {
  // Loaded on use: these native modules exist on iOS only.
  const { Platform } = require("react-native") as typeof import("react-native");
  const Constants = require("expo-constants").default as typeof import("expo-constants").default;
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  const projectId = extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? null;
  const load = () => require("expo-notifications") as typeof import("expo-notifications");
  return {
    isNative: Platform.OS !== "web",
    projectId,
    async getPermission() {
      return (await load().getPermissionsAsync()).status;
    },
    async requestPermission() {
      return (await load().requestPermissionsAsync()).status === "granted" ? "granted" : "denied";
    },
    async getExpoPushToken(id) {
      return (await load().getExpoPushTokenAsync({ projectId: id })).data;
    },
    randomBytes(count) {
      return (require("expo-crypto") as typeof import("expo-crypto")).getRandomBytes(count);
    },
  };
}

async function ensureDeviceId(device: PushDevice): Promise<string> {
  const existing = await StorageService.getDeviceId();
  if (existing) return existing;
  const id = createDeviceId(device);
  await StorageService.setDeviceId(id);
  return id;
}

/**
 * Registers this device for push. `prompt` asks for permission when it has not been decided; without it
 * (silent re-registration at sign-in) nothing is shown to the person.
 */
export async function registerPush(
  api: ApiClient,
  options: { prompt: boolean },
  device: PushDevice = expoPushDevice(),
): Promise<PushResult> {
  if (!device.isNative || !device.projectId) return "unavailable";
  let permission = await device.getPermission();
  if (permission !== "granted" && options.prompt) permission = await device.requestPermission();
  if (permission !== "granted") return "denied";

  const token = await device.getExpoPushToken(device.projectId);
  await api.registerPushToken(await ensureDeviceId(device), token);
  await StorageService.setPushEnabled(true);
  return "registered";
}

/** Removes this device's registration. The server also drops it on logout and account deletion. */
export async function unregisterPush(api: ApiClient): Promise<void> {
  const deviceId = await StorageService.getDeviceId();
  await StorageService.setPushEnabled(false);
  if (deviceId) await api.unregisterPushToken(deviceId);
}

/** Keeps a device the person already turned on registered (tokens and sessions change over time). */
export async function refreshPushRegistration(api: ApiClient, device?: PushDevice): Promise<void> {
  if (!(await StorageService.getPushEnabled())) return;
  await registerPush(api, { prompt: false }, device);
}
