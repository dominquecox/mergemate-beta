import {dropWebPush} from "../push/web";
import { Platform } from "react-native";
import { StorageService } from "../storage";
import { getTurnstileToken } from "../auth/turnstile";
import { ApiClient } from "./client";
import { type ApiMode, resolveApiConfig } from "./config";
import { createApiClient } from "./factory";

// Expo inlines this exact expression at build time. __DEV__ is true for development bundles; /__api is dev-only proxy.
const isDevBuild = (typeof __DEV__ !== "undefined" && Boolean(__DEV__)) || process.env.EXPO_PUBLIC_API_BASE_URL === "/__api";

export const apiMode: ApiMode = resolveApiConfig(process.env.EXPO_PUBLIC_API_BASE_URL, isDevBuild);

export const api: ApiClient = createApiClient(apiMode, {
  platform: Platform.OS === "web" ? "web" : "native",
  nativePlatform: Platform.OS === "android" ? "android" : "ios",
  tokenStore: {
    get: () => StorageService.getSessionToken(),
    set: (token) => StorageService.setSessionToken(token),
    clear: () => StorageService.clearSessionToken(),
  },
  getTurnstileToken,
  onAccountDeleted:async()=>{const results=await Promise.allSettled([StorageService.clearAccountData(),Platform.OS==='web'?dropWebPush():Promise.resolve()]);if(results.some(r=>r.status==='rejected'))throw new Error('Local account cleanup incomplete');},
});

export * from "./client";
export * from "./errors";
export * from "./mock";
