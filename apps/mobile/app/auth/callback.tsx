import React, { useEffect, useRef } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "../../src/context/AuthContext";
import { useTheme } from "../../src/context/ThemeContext";
import { api } from "../../src/api";

/**
 * GitHub sends the person back here with `code` and `state` (or `error` if they said no).
 * Web lands on /auth/callback in the same tab; iOS arrives through the https universal link.
 * The code is posted once with the stored PKCE verifier, then this route is replaced.
 */
export default function AuthCallbackScreen() {
  const router = useRouter();
  const { colors, typography, spacing } = useTheme();
  const { completeGithubSignIn, setError } = useAuth();
  const params = useLocalSearchParams<{ code?: string | string[]; state?: string | string[]; error?: string | string[] }>();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
    const code = first(params.code);
    const state = first(params.state);

    const run = async () => {
      if (first(params.error)) {
        setError("Sign-in was cancelled.");
        router.replace("/(auth)/sign-in");
        return;
      }
      if (!code || !state) {
        setError("That sign-in link isn't valid. Start again.");
        router.replace("/(auth)/sign-in");
        return;
      }
      const ok = await completeGithubSignIn(code, state);
      if (!ok) {
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
      <ActivityIndicator size="large" color={colors.brandLight} />
      <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.md }]}>Finishing sign-in...</Text>
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
