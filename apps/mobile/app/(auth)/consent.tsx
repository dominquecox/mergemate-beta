import { ScreenIntro, InfoLine } from "../../src/components/ScreenDesign";
import React, { useState } from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import { Text } from "../../src/components/Text";
import { useRouter } from "expo-router";
import { useTheme } from "../../src/context/ThemeContext";
import { useConsent } from "../../src/context/ConsentContext";
import { Button } from "../../src/components/Button";
import { Header } from "../../src/components/Header";
import { EmptyState } from "../../src/components/EmptyState";
import { LoadingState } from "../../src/components/LoadingState";
import { Icon } from "../../src/components/Icon";
import { ErrorState } from "../../src/components/ErrorState";

export default function ConsentScreen() {
  const router = useRouter();
  const { colors, typography, spacing, radius } = useTheme();
  const { grantConsent, revokeConsent } = useConsent();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastChoice, setLastChoice] = useState<"agree" | "decline">("agree");
  const [saved, setSaved] = useState(false);

  const handleChoice = async (choice: "agree" | "decline") => {
    setLastChoice(choice);
    setIsSaving(true);
    setError(null);
    try {
      if (choice === "agree") {
        await grantConsent();
      } else {
        await revokeConsent();
      }
      setSaved(true);
      router.replace("/(tabs)/inbox");
    } catch (e: any) {
      setError(e?.message || "Could not save your AI preference. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Header title="AI Transparency & Consent" showBack />
      {isSaving ? (
        <LoadingState
          title="Saving your preference..."
          message="Updating your AI summary settings."
        />
      ) : error ? (
        <ErrorState
          title="Could not save preference"
          message={error}
          onRetry={() => handleChoice(lastChoice)}
        />
      ) : saved ? (
        <EmptyState
          icon="checkmark-circle-outline"
          title="Preference saved"
          message="Your AI summary setting has been updated."
          actionTitle="Continue to Inbox"
          onAction={() => router.replace("/(tabs)/inbox")}
        />
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { padding: spacing.xl }]}>
          <ScreenIntro eyebrow="Your data · Your choice" title="AI, with your permission" description="Understand what is shared before you turn on summaries and risk insights." icon="shield-checkmark-outline"/>
          <InfoLine icon="person-outline" title="Always human in the loop" detail="AI helps you review. Every action on a pull request happens in GitHub."/>

          <View
            style={[
              styles.box,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderRadius: radius.lg,
                marginTop: spacing.xl,
              },
            ]}
          >
            <View style={styles.boxTitleRow}>
              <Icon name="checkmark-circle" size={18} color={colors.riskLow} />
              <Text style={[typography.headline, { color: colors.riskLow }]}>What is sent to the model</Text>
            </View>
            <Text style={[typography.callout, { color: colors.textSecondary, marginTop: 4, lineHeight: 20 }]}>
              • Pull request title and description{"\n"}
              • Selected changed filenames and patch diffs{"\n"}
              • File structure for risk checks
            </Text>
          </View>

          <View
            style={[
              styles.box,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderRadius: radius.lg,
                marginTop: spacing.md,
              },
            ]}
          >
            <View style={styles.boxTitleRow}>
              <Icon name="close-circle" size={18} color={colors.riskHigh} />
              <Text style={[typography.headline, { color: colors.riskHigh }]}>What is NEVER sent</Text>
            </View>
            <Text style={[typography.callout, { color: colors.textSecondary, marginTop: 4, lineHeight: 20 }]}>
              • Passwords, API keys, or secrets (automatically masked first){"\n"}
              • Full git history or untouched repository files{"\n"}
              • Your personal profile details or email address
            </Text>
          </View>

          <View style={[styles.notice, { backgroundColor: colors.surfaceElevated, borderRadius: radius.md, marginTop: spacing.md }]}>
            <View style={styles.noticeRow}>
              <Icon name="lock-closed-outline" size={14} color={colors.textMuted} style={styles.noticeIcon} />
              <Text style={[typography.caption, { color: colors.textMuted, lineHeight: 18, flex: 1 }]}>
                Your code is never stored and never used to train AI models. You can turn AI summaries on or off anytime in Settings.
              </Text>
            </View>
          </View>

          <View style={[styles.actions, { marginTop: spacing.xl }]}>
            <Button
              title="I Agree & Enable AI"
              onPress={() => handleChoice("agree")}
              variant="primary"
              style={{ width: "100%" }}
            />
            <Button
              title="Not Now (Keep AI Off)"
              onPress={() => handleChoice("decline")}
              variant="secondary"
              style={{ width: "100%", marginTop: spacing.sm }}
            />
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  noticeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  noticeIcon: {
    marginTop: 1,
  },
  boxTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  root: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    alignItems: "stretch",
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  box: {
    width: "100%",
    padding: 16,
    borderWidth: 1,
  },
  notice: {
    width: "100%",
    padding: 12,
  },
  actions: {
    width: "100%",
  },
});
