import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, Platform, Linking } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "../../src/context/AuthContext";
import { useTheme } from "../../src/context/ThemeContext";
import { api } from "../../src/api";
import { EmptyState } from "../../src/components/EmptyState";
import { ErrorState } from "../../src/components/ErrorState";
import { LoadingState } from "../../src/components/LoadingState";
import { buildNativeCallbackSchemeUrl, isAndroidWebUserAgent } from "../../src/platform/android";

/**
 * GitHub sends the person back here with `code` and `state` (or `error` if they said no).
 * Web lands on /auth/callback in the same tab; iOS arrives through the https universal link;
 * Android arrives through the https App Link (`app.mergemate.dev` / `dev.mergemate.dev`) or, before
 * Play App Signing SHA-256 verification is active, falls back from the Android browser tab to
 * `mergemate://auth/callback` (only when `navigator.userAgent` contains "Android").
 * The code is posted once with the stored PKCE verifier, then this route is replaced.
 */
export default function AuthCallbackScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { completeGithubSignIn, setError } = useAuth();
  const params = useLocalSearchParams<{ code?: string | string[]; state?: string | string[]; error?: string | string[] }>();
  const started = useRef(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [missingParams, setMissingParams] = useState(false);
  const [nativeSchemeUrl, setNativeSchemeUrl] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
    const code = first(params.code);
    const state = first(params.state);
    const errorParam = first(params.error);

    const run = async () => {
      if (errorParam) {
        setError("Sign-in was cancelled.");
        setLocalError("Sign-in was cancelled.");
        router.replace("/(auth)/sign-in");
        return;
      }
      if (!code || !state) {
        setError("That sign-in link isn't valid. Start again.");
        setMissingParams(true);
        router.replace("/(auth)/sign-in");
        return;
      }
      const ok = await completeGithubSignIn(code, state);
      if (!ok) {
        // When an Android phone opens the https callback in Chrome Custom Tabs before App Links SHA-256
        // verification is live, the web tab has no stored PKCE state; bounce to the installed native app
        // via `mergemate://auth/callback` only when `navigator.userAgent` contains "Android".
        // Desktop and iOS web keep today's sign-in error screen.
        const schemeUrl = buildNativeCallbackSchemeUrl({ code, state });
        if (Platform.OS === "web" && isAndroidWebUserAgent() && schemeUrl) {
          setNativeSchemeUrl(schemeUrl);
          try {
            await Linking.openURL(schemeUrl);
            return;
          } catch {
            // Fall through to show the manual button / sign-in retry.
          }
        }
        setLocalError("Could not complete GitHub sign-in. Please try again.");
        router.replace("/(auth)/sign-in");
        return;
      }
      // First time here, or nothing installed yet: go choose repositories. Otherwise the inbox.
      try {
        const { items } = await api.getOrgInstallations();
        router.replace(items.some((i) => i.status === "active") ? "/(tabs)/inbox" : "/(auth)/repos");
      } catch {
        router.replace("/(tabs)/inbox");
      }
    };
    run();
  }, [params.code, params.state, params.error, completeGithubSignIn, setError, router]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {nativeSchemeUrl && !localError ? (
        <EmptyState
          icon="phone-portrait-outline"
          title="Continue in MergeMate"
          message="Tap below to return to the MergeMate app on your phone and finish signing in."
          actionTitle="Open MergeMate App"
          onAction={() => {
            void Linking.openURL(nativeSchemeUrl);
          }}
        />
      ) : localError ? (
        <ErrorState
          title="Could not finish sign-in"
          message={localError}
          onRetry={() => router.replace("/(auth)/sign-in")}
          retryLabel="Back to Sign In"
        />
      ) : missingParams ? (
        <EmptyState
          icon="key-outline"
          title="Sign-in link expired"
          message="Start a new sign-in from the MergeMate sign-in screen."
          actionTitle="Go to Sign In"
          onAction={() => router.replace("/(auth)/sign-in")}
        />
      ) : (
        <LoadingState
          title="Finishing sign-in..."
          message="Verifying your GitHub authorization and loading your inbox."
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
