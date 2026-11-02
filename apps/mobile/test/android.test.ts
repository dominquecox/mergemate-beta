import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
}));

import appJson from "../app.json";
import easJson from "../eas.json";
import resolveConfig, {
  ANDROID_PACKAGE_DEV,
  ANDROID_PACKAGE_PROD,
  resolveAndroidPackage,
  resolveAppName,
} from "../app.config";
import {
  ANDROID_DEV_PACKAGE,
  ANDROID_PACKAGE,
  MIN_TOUCH_TARGET_DP,
  isExternalBillingLinkAllowed,
  resolveHardwareBackAction,
} from "../src/platform/android";
import {
  ANDROID_NOTIFICATION_CHANNEL_ID,
  ANDROID_NOTIFICATION_CHANNEL_NAME,
} from "../src/push/registration";

describe("MM-053 Android app configuration & parity", () => {
  it("sets the canonical Android package name dev.mergemate.app and dev suffix dev.mergemate.app.dev", () => {
    expect(appJson.expo.android.package).toBe("dev.mergemate.app");
    expect(ANDROID_PACKAGE).toBe("dev.mergemate.app");
    expect(ANDROID_PACKAGE_PROD).toBe("dev.mergemate.app");
    expect(ANDROID_DEV_PACKAGE).toBe("dev.mergemate.app.dev");
    expect(ANDROID_PACKAGE_DEV).toBe("dev.mergemate.app.dev");
    expect(resolveAndroidPackage(undefined)).toBe("dev.mergemate.app");
    expect(resolveAndroidPackage("production")).toBe("dev.mergemate.app");
    expect(resolveAndroidPackage("development")).toBe("dev.mergemate.app.dev");
    expect(resolveAppName("development")).toBe("MergeMate (Dev)");
    expect(resolveAppName(undefined)).toBe("MergeMate");

    const prev = process.env.APP_VARIANT;
    try {
      process.env.APP_VARIANT = "development";
      const devCfg = resolveConfig({ config: appJson.expo as any } as any);
      expect(devCfg.android?.package).toBe("dev.mergemate.app.dev");
      expect(devCfg.name).toBe("MergeMate (Dev)");

      delete process.env.APP_VARIANT;
      const prodCfg = resolveConfig({ config: appJson.expo as any } as any);
      expect(prodCfg.android?.package).toBe("dev.mergemate.app");
      expect(prodCfg.name).toBe("MergeMate");
    } finally {
      if (prev === undefined) delete process.env.APP_VARIANT;
      else process.env.APP_VARIANT = prev;
    }
  });

  it("enables Android 15 edge-to-edge, keyboard resize, allowBackup=false, VIBRATE permission, and blocks broad media permissions", () => {
    const android = appJson.expo.android;
    expect(android.edgeToEdgeEnabled).toBe(true);
    expect(android.softwareKeyboardLayoutMode).toBe("resize");
    expect(android.allowBackup).toBe(false);
    expect(android.permissions).toContain("android.permission.VIBRATE");
    expect(android.blockedPermissions).toEqual(
      expect.arrayContaining([
        "android.permission.READ_EXTERNAL_STORAGE",
        "android.permission.WRITE_EXTERNAL_STORAGE",
        "android.permission.READ_MEDIA_IMAGES",
        "android.permission.READ_MEDIA_VIDEO",
      ]),
    );
  });

  it("configures verified Android App Links for app.mergemate.dev and dev.mergemate.dev /auth/callback", () => {
    const filters = appJson.expo.android.intentFilters;
    expect(filters).toHaveLength(1);
    const filter = filters[0]!;
    expect(filter.action).toBe("VIEW");
    expect(filter.autoVerify).toBe(true);
    expect(filter.category).toEqual(["BROWSABLE", "DEFAULT"]);
    expect(filter.data).toEqual([
      { scheme: "https", host: "app.mergemate.dev", pathPrefix: "/auth/callback" },
      { scheme: "https", host: "dev.mergemate.dev", pathPrefix: "/auth/callback" },
    ]);
  });

  it("isolates associated domains and PR/auth links by native variant", () => {
    for (const [variant,host] of [["development","dev.mergemate.dev"],["production","app.mergemate.dev"]]) {
      const before=process.env.APP_VARIANT; process.env.APP_VARIANT=variant;
      try {
        const result=resolveConfig({projectRoot:process.cwd(),staticConfigPath:null,packageJsonPath:null,config:{name:"MergeMate",slug:"mergemate"}});
        expect(result.ios?.associatedDomains).toEqual([`applinks:${host}`]);
        expect(result.android?.intentFilters?.[0]?.data).toEqual([
          {scheme:"https",host,pathPrefix:"/auth/callback"},{scheme:"https",host,pathPrefix:"/pr/"},
        ]);
      } finally { if(before===undefined) delete process.env.APP_VARIANT; else process.env.APP_VARIANT=before; }
    }
  });

  it("defines EAS build profiles for android-dev (APK), android-preview (AAB), and android-production (AAB)", () => {
    expect(easJson.cli.appVersionSource).toBe("local");
    expect(appJson.expo.version).toBe("0.2.0");
    expect(appJson.expo.ios.buildNumber).toBe("1");
    expect(appJson.expo.android.versionCode).toBe(2);
    expect(easJson.build["android-dev"]).toMatchObject({
      distribution: "internal",
      android: { buildType: "apk" },
      env: {
        APP_VARIANT: "development",
        EXPO_PUBLIC_API_BASE_URL: "https://api-dev.mergemate.dev",
      },
    });
    expect(easJson.build["android-preview"]).toMatchObject({
      distribution: "internal",
      android: { buildType: "app-bundle" },
      env: {
        EXPO_PUBLIC_API_BASE_URL: "https://api-dev.mergemate.dev",
      },
    });
    expect(easJson.build["android-production"]).toMatchObject({
      autoIncrement: true,
      android: { buildType: "app-bundle" },
      env: {
        EXPO_PUBLIC_API_BASE_URL: "https://api.mergemate.dev",
      },
    });
  });

  it("resolves Android hardware Back and system back-swipe order deterministically", () => {
    expect(
      resolveHardwareBackAction({
        hasOpenSheet: true,
        canStepBackInScreen: true,
        canGoBackInStack: true,
        segments: ["pr", "[owner]", "[repo]", "[number]"],
      }),
    ).toBe("close-sheet");

    expect(
      resolveHardwareBackAction({
        hasOpenSheet: false,
        canStepBackInScreen: true,
        canGoBackInStack: false,
        segments: ["(auth)", "welcome"],
      }),
    ).toBe("step-back");

    expect(
      resolveHardwareBackAction({
        hasOpenSheet: false,
        canStepBackInScreen: false,
        canGoBackInStack: true,
        segments: ["pr", "[owner]", "[repo]", "[number]"],
      }),
    ).toBe("pop-stack");

    expect(
      resolveHardwareBackAction({
        hasOpenSheet: false,
        canStepBackInScreen: false,
        canGoBackInStack: false,
        segments: ["(tabs)", "settings"],
      }),
    ).toBe("go-inbox");

    expect(
      resolveHardwareBackAction({
        hasOpenSheet: false,
        canStepBackInScreen: false,
        canGoBackInStack: false,
        segments: ["(tabs)", "inbox"],
      }),
    ).toBe("exit-app");
  });

  it("enforces store-compliant billing link-out on Android (same as iOS) and blocks native /billing routes", () => {
    expect(isExternalBillingLinkAllowed("web", false)).toBe(true);
    expect(isExternalBillingLinkAllowed("android", true)).toBe(true);
    expect(isExternalBillingLinkAllowed("ios", true)).toBe(true);
    expect(isExternalBillingLinkAllowed("android", false)).toBe(false);
    expect(isExternalBillingLinkAllowed("ios", false)).toBe(false);

    const billingLayout = fs.readFileSync(path.resolve(__dirname, "../app/billing/_layout.tsx"), "utf8");
    expect(billingLayout).toContain('Platform.OS !== "web"');
    expect(billingLayout).toContain('<Redirect href="/(tabs)/settings" />');
  });

  it("uses the 'reviews-and-mentions' notification channel and >= 48dp minimum touch target", () => {
    expect(ANDROID_NOTIFICATION_CHANNEL_ID).toBe("reviews-and-mentions");
    expect(ANDROID_NOTIFICATION_CHANNEL_NAME).toBe("Reviews and mentions");
    expect(MIN_TOUCH_TARGET_DP).toBeGreaterThanOrEqual(48);
  });
});
