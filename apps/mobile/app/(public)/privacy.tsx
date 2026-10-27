import { Section } from "../../src/components/ScreenDesign";
import React, { useState } from "react";
import { View, ScrollView, StyleSheet } from "react-native";
import { Text } from "../../src/components/Text";
import { useTheme } from "../../src/context/ThemeContext";
import { Header } from "../../src/components/Header";
import { EmptyState } from "../../src/components/EmptyState";
import { ErrorState } from "../../src/components/ErrorState";
import { LoadingState } from "../../src/components/LoadingState";

const PRIVACY_SECTIONS = [
  {
    title: "1. Read-Only Scope",
    body: "MergeMate operates strictly on read-only permissions granted through the official GitHub App integration. You choose which individual repositories or organizations MergeMate can see.",
  },
  {
    title: "2. Automated Secret Redaction",
    body: "Before any patch diff is sent to AI models for evaluation, automated pattern scanners identify potential secrets (API tokens, private keys, connection strings) and mask them with [REDACTED]. Raw secrets are never sent to external AI providers.",
  },
  {
    title: "3. Zero Code Retention",
    body: "Your source code is never permanently stored on our servers and is never used to train frontier AI models. Only high-level review metadata and summaries are cached in memory for your session.",
  },
  {
    title: "4. Right to Deletion",
    body: "You have the right to delete your account at any time. Account deletion immediately revokes the GitHub grant, purges cached review metadata, and ends all active sessions.",
  },
];

export default function PrivacyScreen() {
  const { colors, typography, spacing } = useTheme();
  const [isLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Header title="Privacy Policy" showBack />
      {isLoading ? (
        <LoadingState title="Loading privacy policy..." message="Preparing policy document." />
      ) : error ? (
        <ErrorState title="Couldn't load privacy policy" message={error} onRetry={() => setError(null)} />
      ) : PRIVACY_SECTIONS.length === 0 ? (
        <EmptyState icon="lock-closed-outline" title="Policy unavailable" message="Please contact privacy@mergemate.dev for our privacy policy." />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.base, paddingBottom: 60 }}>

          <Text style={[typography.caption, { color: colors.textMuted, marginTop: 4 }]}>
            Effective date: October 26, 2026 · Ploonu LLC
          </Text>

          <View style={{ marginTop: spacing.md, gap: 16 }}>
            {PRIVACY_SECTIONS.map((sec) => (
              <Section key={sec.title}>
                <Text style={[typography.headline, { color: colors.text }]} accessibilityRole="header">
                  {sec.title}
                </Text>
                <Text style={[typography.body, { color: colors.textSecondary, marginTop: 4, lineHeight: 22 }]}>
                  {sec.body}
                </Text>
              </Section>
            ))}

            <View style={[styles.footer, { borderTopColor: colors.border }]}>
              <Text style={[typography.caption, { color: colors.textMuted }]}>
                Questions? Contact privacy@mergemate.dev · Ploonu LLC
              </Text>
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  footer: {
    borderTopWidth: 1,
    paddingTop: 16,
    marginTop: 16,
  },
});
