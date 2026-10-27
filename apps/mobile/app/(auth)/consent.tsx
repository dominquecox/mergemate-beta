import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "../../src/context/ThemeContext";
import { useConsent } from "../../src/context/ConsentContext";
import { Button } from "../../src/components/Button";
import { Header } from "../../src/components/Header";

export default function ConsentScreen() {
  const router = useRouter();
  const { colors, typography, spacing, radius } = useTheme();
  const { grantConsent, revokeConsent } = useConsent();

  const handleAgree = async () => {
    await grantConsent();
    router.replace("/(tabs)/inbox");
  };

  const handleNotNow = async () => {
    await revokeConsent();
    router.replace("/(tabs)/inbox");
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Header title="AI Transparency & Consent" showBack />
      <ScrollView contentContainerStyle={[styles.content, { padding: spacing.xl }]}>
        <View style={[styles.iconCircle, { backgroundColor: colors.brandSubtle, borderColor: colors.brandMuted }]}>
          <Text style={styles.sparkleIcon}>✦</Text>
        </View>

        <Text style={[typography.title1, { color: colors.text, marginTop: spacing.base, textAlign: "center" }]}>
          How MergeMate Uses AI
        </Text>

        <Text
          style={[
            typography.body,
            { color: colors.textSecondary, marginTop: spacing.sm, textAlign: "center", lineHeight: 22 },
          ]}
        >
          MergeMate uses Meta AI models to generate high-level summaries, detect structural risks, and prioritize pull requests. You are always in control.
        </Text>

        <View style={[styles.box, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, marginTop: spacing.xl }]}>
          <Text style={[typography.headline, { color: colors.riskLow }]}>✓ What is sent to the model</Text>
          <Text style={[typography.callout, { color: colors.textSecondary, marginTop: 4, lineHeight: 20 }]}>
            • Pull request title and description{"\n"}
            • Filtered changed filenames and patch diffs (up to budget limits){"\n"}
            • Code structure for risk evaluation
          </Text>
        </View>

        <View style={[styles.box, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, marginTop: spacing.md }]}>
          <Text style={[typography.headline, { color: colors.riskHigh }]}>✕ What is NEVER sent</Text>
          <Text style={[typography.callout, { color: colors.textSecondary, marginTop: 4, lineHeight: 20 }]}>
            • Passwords, API tokens, or credentials (automatically redacted){"\n"}
            • Entire git history or untouched repository files{"\n"}
            • Personal profile details or email addresses
          </Text>
        </View>

        <View style={[styles.notice, { backgroundColor: colors.surfaceElevated, borderRadius: radius.md, marginTop: spacing.md }]}>
          <Text style={[typography.caption, { color: colors.textMuted, lineHeight: 18 }]}>
            🔒 Your code is never used to train frontier models. You can change this consent at any time in Settings.
          </Text>
        </View>

        <View style={[styles.actions, { marginTop: spacing.xl }]}>
          <Button title="I Agree & Enable AI" onPress={handleAgree} variant="primary" style={{ width: "100%" }} />
          <Button
            title="Not Now (Keep AI Off)"
            onPress={handleNotNow}
            variant="secondary"
            style={{ width: "100%", marginTop: spacing.sm }}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    alignItems: "center",
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  sparkleIcon: {
    fontSize: 28,
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
