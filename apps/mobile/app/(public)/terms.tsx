import { Section } from "../../src/components/ScreenDesign";
import React, { useState } from "react";
import { View, ScrollView, StyleSheet } from "react-native";
import { Text } from "../../src/components/Text";
import { useTheme } from "../../src/context/ThemeContext";
import { Header } from "../../src/components/Header";
import { EmptyState } from "../../src/components/EmptyState";
import { ErrorState } from "../../src/components/ErrorState";
import { LoadingState } from "../../src/components/LoadingState";

const TERMS_SECTIONS = [
  {
    title: "1. Overview",
    body: "MergeMate is provided by Ploonu LLC as an intelligent companion for GitHub pull request triage and automated risk assessment. By connecting your GitHub account or using MergeMate, you agree to these terms.",
  },
  {
    title: "2. Read-Only GitHub Authorization",
    body: "MergeMate requests strictly read-only GitHub App permissions. MergeMate will never merge, approve, comment, commit, or close pull requests or repositories on your behalf.",
  },
  {
    title: "3. User Data & Zero Code Storage",
    body: "We do not store your repository source code or history. Patch diffs are inspected in memory for AI evaluation and immediately discarded. Access tokens remain encrypted at rest using server-side keys.",
  },
  {
    title: "4. Subscriptions & Cancellation",
    body: "Pro subscriptions are processed via Stripe. You can cancel at any time through the customer portal, and your plan remains active until the end of the billing cycle.",
  },
];

export default function TermsScreen() {
  const { colors, typography, spacing } = useTheme();
  const [isLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Header title="Terms of Service" showBack />
      {isLoading ? (
        <LoadingState title="Loading terms of service..." message="Preparing terms document." />
      ) : error ? (
        <ErrorState title="Couldn't load terms" message={error} onRetry={() => setError(null)} />
      ) : TERMS_SECTIONS.length === 0 ? (
        <EmptyState icon="document-text-outline" title="Terms unavailable" message="Please contact support@mergemate.dev for our terms of service." />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.base, paddingBottom: 60 }}>

          <Text style={[typography.caption, { color: colors.textMuted, marginTop: 4 }]}>
            Last updated: October 26, 2026 · Ploonu LLC
          </Text>

          <View style={{ marginTop: spacing.md, gap: 16 }}>
            {TERMS_SECTIONS.map((sec) => (
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
                Ploonu LLC · 1007 N Orange St, Wilmington, DE · support@mergemate.dev
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
