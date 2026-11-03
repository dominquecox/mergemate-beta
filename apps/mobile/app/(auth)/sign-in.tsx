import { useScreenHeading } from "../../src/hooks/useScreenHeading";
import { hasPendingLogout } from "../../src/auth/session-events";
import React, { useState } from "react";
import { View, Image, TouchableOpacity, StyleSheet, Platform, ScrollView } from "react-native";
import { Text } from "../../src/components/Text";
import { useRouter } from "expo-router";
import { useAuth } from "../../src/context/AuthContext";
import { useTheme } from "../../src/context/ThemeContext";
import { Button } from "../../src/components/Button";
import { EmptyState } from "../../src/components/EmptyState";
import { ErrorState } from "../../src/components/ErrorState";
import { LoadingState } from "../../src/components/LoadingState";
import { ExperienceIntro, ExperienceSurface, SetupPath } from "../../src/components/ExperienceDesign";
import { Section, InfoLine } from "../../src/components/ScreenDesign";
import { Icon } from "../../src/components/Icon";
import { useLayout } from "../../src/layout/useLayout";

export default function SignInScreen() {
  const router = useRouter();
  const { isDesktop } = useLayout();
  const heading = useScreenHeading();
  const { signInWithGithub, startDemo, signOut, isLoading, error, clearError, localCleanupPending, retryLocalCleanup } = useAuth();
  const { colors, typography, spacing, isDark } = useTheme();
  const logoutPending = Platform.OS === "web" && hasPendingLogout();
  const [offlineState, setOfflineState] = useState(false);
  const [lastAttempt, setLastAttempt] = useState<"github" | "demo">("github");

  const handleSignIn = async () => {
    setLastAttempt("github");
    clearError();
    const result = await signInWithGithub(Platform.OS === "web" ? "web" : "ios");
    if (result === "signed_in") router.replace("/(tabs)/inbox");
  };

  const handleDemo = async () => {
    setLastAttempt("demo");
    clearError();
    if (await startDemo()) router.replace("/(tabs)/inbox");
  };

  const handleRetry = () => {
    if (lastAttempt === "demo") {
      handleDemo();
    } else {
      handleSignIn();
    }
  };

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.background, padding: isDesktop ? 28 : 18 }]}>
      <View style={styles.header}>
        <Image
          source={isDark ? require("../../assets/logo-dark.png") : require("../../assets/logo-light.png")}
          style={styles.logo}
          resizeMode="contain"
          accessibilityRole="image"
          accessibilityLabel="MergeMate"
        />
        <ExperienceIntro eyebrow="Your connected workspace" title={"Connect the work.\nAutomate what’s next."} description="Bring your repositories, review context, and visual agent workflows into one workspace." headingRef={heading} />
        <SetupPath active="connect" />
      </View>

      {isLoading ? (
        <LoadingState
          title={logoutPending ? "Finishing sign-out..." : lastAttempt === "demo" ? "Starting demo mode..." : "Connecting to GitHub..."}
          message="Setting up your review inbox. This only takes a moment."
        />
      ) : logoutPending ? (
        <ErrorState title="Sign-out is pending" message={error ?? "Reconnect to finish signing out of this browser."} onRetry={() => void signOut()} retryLabel="Finish signing out" />
      ) : localCleanupPending ? (
        <ErrorState title="Account deleted" message={error ?? "Clear this browser's site data or this device's app data before signing in again."} onRetry={() => void retryLocalCleanup()} retryLabel="Clear local data" />
      ) : error ? (
        <ErrorState
          title="Could not sign you in"
          message={error}
          onRetry={handleRetry}
          retryLabel="Try Again"
        />
      ) : offlineState ? (
        <EmptyState
          icon="cloud-offline-outline"
          title="Network offline"
          message="You can still explore MergeMate using sample pull requests in Demo Mode."
          actionTitle="Try the Demo"
          onAction={() => {
            setOfflineState(false);
            handleDemo();
          }}
        />
      ) : (
        <View style={[styles.bentoGrid, isDesktop && styles.bentoGridDesktop]}>
          <ExperienceSurface accent style={[styles.actions, isDesktop && { flex: 1 }]}>
            <Button
              title="Continue with GitHub"
              onPress={handleSignIn}
              loading={isLoading}
              variant="primary"
              style={{ width: "100%", borderRadius: 14, minHeight: 48 }}
            />

            <TouchableOpacity
              onPress={handleDemo}
              disabled={isLoading}
              style={[
                styles.demoBtn,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderRadius: 14,
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
                <Text style={[typography.footnote, { color: colors.textSecondary, textAlign: "left" }]}>
                  Explore sample repositories, AI summaries, visual agent workflows, and risk triage without connecting GitHub.
                </Text>
              </View>
            </TouchableOpacity>
          </ExperienceSurface>

          <Section title="Connection permissions" icon="shield-checkmark-outline" style={{ width: "100%", ...(isDesktop ? { flex: 1 } : {}) }}>
            <InfoLine icon="git-pull-request-outline" title="Pull request context" detail="Read selected diffs, comments and check results from repositories you connect." />
            <InfoLine icon="folder-open-outline" title="Repository metadata" detail="Only the repositories you choose on GitHub are available to MergeMate." />
            <InfoLine icon="person-outline" title="Permission-aware actions" detail="Review workflows are read-only. Isolated code-fix workflows publish only draft PRs when you run them." />
          </Section>
        </View>
      )}

      <View style={[styles.footer, { marginTop: spacing.xl }]}>
        <View style={styles.privacyRow}>
          <Icon name="lock-closed-outline" size={14} color={colors.textMuted} style={styles.privacyIcon} />
          <Text style={[typography.caption, { color: colors.textMuted, textAlign: "center", lineHeight: 18, flexShrink: 1 }]}>
            We never store your code. Your GitHub token stays encrypted on our server, never on this device.
          </Text>
        </View>

        <View style={[styles.linksRow, { marginTop: spacing.sm }]}>
          <TouchableOpacity
            onPress={() => router.push("/(public)/privacy")}
            style={styles.footerLinkBtn}
            accessibilityRole="link"
            accessibilityLabel="Privacy Policy"
          >
            <Text style={[typography.footnote, { color: colors.brandLight, fontWeight: "600" }]}>Privacy</Text>
          </TouchableOpacity>
          <Text style={{ color: colors.textMuted }} accessibilityElementsHidden>
            ·
          </Text>
          <TouchableOpacity
            onPress={() => router.push("/(public)/terms")}
            style={styles.footerLinkBtn}
            accessibilityRole="link"
            accessibilityLabel="Terms of Service"
          >
            <Text style={[typography.footnote, { color: colors.brandLight, fontWeight: "600" }]}>Terms</Text>
          </TouchableOpacity>
          <Text style={{ color: colors.textMuted }} accessibilityElementsHidden>
            ·
          </Text>
          <TouchableOpacity
            onPress={() => router.push("/(public)/support")}
            style={styles.footerLinkBtn}
            accessibilityRole="link"
            accessibilityLabel="Support and Contact"
          >
            <Text style={[typography.footnote, { color: colors.brandLight, fontWeight: "600" }]}>Support</Text>
          </TouchableOpacity>
        </View>

        <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.xs }]}>
          Powered by Meta AI models
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: "flex-start",
    alignItems: "stretch",
  },
  header: {
    alignItems: "stretch",
    gap: 18,
    marginTop: 4,
  },
  logo: {
    width: 140,
    height: 34,
  },
  bentoGrid: {
    gap: 16,
    marginTop: 18,
  },
  bentoGridDesktop: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 20,
  },
  actions: {
    width: "100%",
  },
  demoBtn: {
    width: "100%",
    minHeight: 44,
    padding: 14,
    borderWidth: 1,
    alignItems: "flex-start",
  },
  demoContent: {
    alignItems: "flex-start",
    gap: 6,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  footer: {
    alignItems: "stretch",
    paddingBottom: 24,
  },
  privacyRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "center",
    gap: 6,
  },
  privacyIcon: {
    marginTop: 2,
  },
  linksRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  footerLinkBtn: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
  },
});
