import { useEffect } from "react";
import { BackHandler, Platform, Vibration, type PressableAndroidRippleConfig } from "react-native";

/** Android applicationId on Google Play and production builds. */
export const ANDROID_PACKAGE = "dev.mergemate.app";
/** Side-by-side internal phone APK applicationId for development builds. */
export const ANDROID_DEV_PACKAGE = "dev.mergemate.app.dev";

/** Minimum Material / Play Store touch target dimension (48x48 dp). */
export const MIN_TOUCH_TARGET_DP = 48;

/** Resolves the Android package name from APP_VARIANT ("development" -> dev.mergemate.app.dev). */
export function resolveAndroidPackage(variant?: string): string {
  return variant === "development" ? ANDROID_DEV_PACKAGE : ANDROID_PACKAGE;
}

/**
 * Standard Material ripple configuration for Android Pressable surfaces.
 * Returns undefined off Android so iOS and web are unaffected.
 */
export function androidRipple(
  color = "rgba(129, 140, 248, 0.16)",
  borderless = false,
): PressableAndroidRippleConfig | undefined {
  if (Platform.OS !== "android") return undefined;
  return { color, borderless };
}

/** Light haptic tick on Android when a triage card is sorted (requires android.permission.VIBRATE). */
export function triggerAndroidHaptic(): void {
  if (Platform.OS === "android") {
    try {
      Vibration.vibrate(10);
    } catch {
      // Ignore on devices without a vibrator motor.
    }
  }
}

/**
 * Store policy gate (specs/ANDROID.md "Billing on Android"):
 * In-app Stripe checkout is web-only. Native iOS and Android only open the external web billing page
 * from Settings when external billing links are allowed (`allowExternalBillingLink = true` by default;
 * flip to `false` if a store reviewer objects so the native row hides without any API change).
 */
export function isExternalBillingLinkAllowed(
  platformOs: string = Platform.OS,
  allowExternalBillingLink = true,
): boolean {
  if (platformOs === "web") return true;
  return allowExternalBillingLink;
}

export type BackNavigationState = {
  /** Whether a modal, bottom sheet, or inline drawer is currently open on the screen. */
  hasOpenSheet?: boolean;
  /** Whether the current screen can step backward within its own state (e.g. onboarding step > 0, search query). */
  canStepBackInScreen?: boolean;
  /** Whether the navigation stack has a previous screen to pop. */
  canGoBackInStack?: boolean;
  /** Current Expo Router route segments. */
  segments: string[];
};

export type BackNavigationAction =
  | "close-sheet"
  | "step-back"
  | "pop-stack"
  | "go-inbox"
  | "exit-app";

/**
 * Pure decision function for Android hardware Back and system back-swipe gesture (specs/ANDROID.md):
 * 1. Close an open sheet/drawer first.
 * 2. Step back inside a multi-step flow (e.g. welcome carousel or active search query).
 * 3. Pop the navigation stack when a parent route exists.
 * 4. From a secondary bottom tab (triage, notifications, settings), return to Inbox first.
 * 5. From the root Inbox or sign-in screen, hand back to Android to exit the activity.
 */
export function resolveHardwareBackAction(state: BackNavigationState): BackNavigationAction {
  if (state.hasOpenSheet) return "close-sheet";
  if (state.canStepBackInScreen) return "step-back";
  if (state.canGoBackInStack) return "pop-stack";
  if (state.segments[0] === "(tabs)" && state.segments[1] && state.segments[1] !== "inbox") {
    return "go-inbox";
  }
  return "exit-app";
}

/**
 * Registers an Android hardware Back / back-swipe listener while `enabled` is true.
 * Return `true` from `onBack` when the press was handled in-app, or `false` to let Android pop/exit.
 */
export function useAndroidBackHandler(onBack: () => boolean, enabled = true): void {
  useEffect(() => {
    if (Platform.OS !== "android" || !enabled) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", onBack);
    return () => sub.remove();
  }, [onBack, enabled]);
}
