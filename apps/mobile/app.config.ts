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
  return {
    ...base,
    ...config,
    name: resolveAppName(variant),
    android: {
      ...base.android,
      ...config.android,
      package: resolveAndroidPackage(variant),
    },
  };
};
