import React, { useState } from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet, Platform, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../../src/context/AuthContext";
import { useTheme } from "../../src/context/ThemeContext";
import { Button } from "../../src/components/Button";

export default function SignInScreen() {
  const router = useRouter();
  const { signInWithGithub, startDemo, isLoading, error, clearError } = useAuth();
  const { colors, typography, spacing, radius, isDark } = useTheme();
  const [offlineState, setOfflineState] = useState(false);

  const handleSignIn = async () => {
    clearError();
    await signInWithGithub(Platform.OS === "ios" ? "ios" : "web");
    router.replace("/(tabs)/inbox");
  };

  const handleDemo = async () => {
    clearError();
    await startDemo();
    router.replace("/(tabs)/inbox");
  };

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.background, padding: spacing.xl }]}>
      <View style={styles.header}>
        <Image
          source={require("../../assets/icon.png")}
          style={[styles.appIcon, { borderRadius: radius.xl }]}
          resizeMode="cover"
          accessibilityLabel="MergeMate Icon"
        />
        <Image
          source={isDark ? require("../../assets/logo-dark.png") : require("../../assets/logo-light.png")}
          style={[styles.logo, { marginTop: spacing.md }]}
          resizeMode="contain"
          accessibilityLabel="MergeMate"
        />
        <Text style={[typography.title2, { color: colors.text, marginTop: spacing.base, textAlign: "center" }]}>
          Sign in to start
        </Text>
        <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.xs, textAlign: "center" }]}>
          Your intelligent pull request companion.
        </Text>
      </View>

      {error && (
        <View style={[styles.errorBanner, { backgroundColor: colors.riskHighBg, borderColor: colors.riskHigh }]}>
          <Text style={[typography.callout, { color: colors.riskHigh, fontWeight: "600" }]}>⚠ {error}</Text>
        </View>
      )}

      {offlineState && (
        <View style={[styles.errorBanner, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
          <Text style={[typography.callout, { color: colors.textSecondary }]}>
            📡 Network offline. You can still test with Demo Mode.
          </Text>
        </View>
      )}

      <View style={[styles.actions, { marginTop: spacing.xxl }]}>
        <Button
          title="Continue with GitHub"
          onPress={handleSignIn}
          loading={isLoading}
          variant="primary"
          style={{ width: "100%" }}
        />

        <TouchableOpacity
          onPress={handleDemo}
          disabled={isLoading}
          style={[
            styles.demoBtn,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.demoBadge,
              borderRadius: radius.md,
              marginTop: spacing.md,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Try the demo with sample data"
        >
          <View style={styles.demoContent}>
            <View style={[styles.badge, { backgroundColor: colors.demoBadgeBg }]}>
              <Text style={[typography.caption, { color: colors.demoBadge, fontWeight: "700" }]}>SAMPLE DATA</Text>
            </View>
            <Text style={[typography.headline, { color: colors.text, fontWeight: "600" }]}>
              Try the Demo
            </Text>
            <Text style={[typography.footnote, { color: colors.textSecondary, textAlign: "center" }]}>
              Explore sample repositories, AI summaries, and risk triage without connecting GitHub.
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      <View style={[styles.footer, { marginTop: spacing.xl }]}>
        <Text style={[typography.caption, { color: colors.textMuted, textAlign: "center", lineHeight: 18 }]}>
          🔒 We never store your code. Your GitHub token stays encrypted on our server, never on this device.
        </Text>

        <View style={[styles.linksRow, { marginTop: spacing.md }]}>
          <TouchableOpacity onPress={() => router.push("/(public)/privacy")}>
            <Text style={[typography.footnote, { color: colors.brandLight }]}>Privacy</Text>
          </TouchableOpacity>
          <Text style={{ color: colors.textMuted }}>·</Text>
          <TouchableOpacity onPress={() => router.push("/(public)/terms")}>
            <Text style={[typography.footnote, { color: colors.brandLight }]}>Terms</Text>
          </TouchableOpacity>
          <Text style={{ color: colors.textMuted }}>·</Text>
          <TouchableOpacity onPress={() => router.push("/(public)/support")}>
            <Text style={[typography.footnote, { color: colors.brandLight }]}>Support</Text>
          </TouchableOpacity>
        </View>

        <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.md }]}>
          Powered by Meta AI models
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: "space-between",
    alignItems: "center",
  },
  header: {
    alignItems: "center",
    marginTop: 24,
  },
  appIcon: {
    width: 80,
    height: 80,
  },
  logo: {
    width: 180,
    height: 44,
  },
  errorBanner: {
    width: "100%",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginVertical: 12,
  },
  actions: {
    width: "100%",
  },
  demoBtn: {
    width: "100%",
    padding: 16,
    borderWidth: 1,
    alignItems: "center",
  },
  demoContent: {
    alignItems: "center",
    gap: 6,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  footer: {
    alignItems: "center",
    paddingBottom: 24,
  },
  linksRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
});
