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

export default ({ config }: ConfigContext): ExpoConfig => {
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
