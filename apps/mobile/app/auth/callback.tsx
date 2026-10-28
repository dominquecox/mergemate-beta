import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "../../src/context/AuthContext";
import { useTheme } from "../../src/context/ThemeContext";
import { api } from "../../src/api";
import { EmptyState } from "../../src/components/EmptyState";
import { ErrorState } from "../../src/components/ErrorState";
import { LoadingState } from "../../src/components/LoadingState";
import { validOAuthParams } from "../../src/navigation/links";

/**
 * GitHub sends the person back here with `code` and `state` (or `error` if they said no).
 * Web lands on /auth/callback in the same tab; iOS arrives through the https universal link;
 * Android arrives only through the verified HTTPS App Link.
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

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const code = typeof params.code === "string" ? params.code : undefined;
    const state = typeof params.state === "string" ? params.state : undefined;
    const errorParam = typeof params.error === "string" ? params.error : undefined;

    const run = async () => {
      if (errorParam) {
        setError("Sign-in was cancelled.");
        setLocalError("Sign-in was cancelled.");
        router.replace("/(auth)/sign-in");
        return;
      }
      if (!validOAuthParams(params) || !code || !state) {
        setError("That sign-in link isn't valid. Start again.");
        setMissingParams(true);
        router.replace("/(auth)/sign-in");
        return;
      }
      const ok = await completeGithubSignIn(code, state);
      if (!ok) {
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
      {localError ? (
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
