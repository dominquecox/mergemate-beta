import type { ConfigContext, ExpoConfig } from "expo/config";
import appJson from "./app.json";

export const ANDROID_PACKAGE_PROD = "dev.mergemate.app";
export const ANDROID_PACKAGE_DEV = "dev.mergemate.app.dev";

export function resolveAndroidPackage(variant = process.env.APP_VARIANT): string {
  return variant === "development" ? ANDROID_PACKAGE_DEV : ANDROID_PACKAGE_PROD;
}

export function resolveAppName(variant = process.env.APP_VARIANT): string {
  return variant === "development" ? "MergeMate (Dev)" : appJson.expo.name;
}

/** True when Expo is running a web export or web dev server (`expo export -p web`, `--platform web`, `expo start --web`). */
export function isWebExport(argv: readonly string[] = process.argv, env: Record<string, string | undefined> = process.env): boolean {
  if (env.EXPO_PLATFORM === "web" || env.EXPO_OS === "web") return true;
  return argv.some((arg, i) => arg === "--web" || arg === "--platform=web" || arg === "-p=web" || (arg === "web" && /^(-p|--platform)$/.test(argv[i - 1] ?? "")));
}

/** CF Access service-token values may only ever be baked into native development/preview builds, never any web export. */
export function assertAccessTokenAllowed(env: Record<string, string | undefined> = process.env, argv: readonly string[] = process.argv): void {
  const accessId = env.EXPO_PUBLIC_CF_ACCESS_CLIENT_ID?.trim();
  const accessSecret = env.EXPO_PUBLIC_CF_ACCESS_CLIENT_SECRET?.trim();
  if (!accessId && !accessSecret) return;
  const apiBase = env.EXPO_PUBLIC_API_BASE_URL?.trim() ?? "";
  if (isWebExport(argv, env) || apiBase === "/__api" || !apiBase.includes("api-dev.mergemate.dev")) {
    throw new Error("CF Access service-token variables are allowed only in native development/preview builds.");
  }
}

export default ({ config }: ConfigContext): ExpoConfig => {
  assertAccessTokenAllowed();
  const variant = process.env.APP_VARIANT;
  const base = appJson.expo as unknown as ExpoConfig;
  const host = variant === "development" ? "dev.mergemate.dev" : "app.mergemate.dev";
  return {
    ...base,
    ...config,
    name: resolveAppName(variant),
    ios: { ...base.ios, ...config.ios, associatedDomains: [`applinks:${host}`] },
    android: {
      ...base.android,
      ...config.android,
      package: resolveAndroidPackage(variant),
      intentFilters: [{ action: "VIEW", autoVerify: true, category: ["BROWSABLE", "DEFAULT"], data: [{ scheme: "https", host, pathPrefix: "/auth/callback" }, { scheme: "https", host, pathPrefix: "/pr/" }] }],
    },
  };
};
