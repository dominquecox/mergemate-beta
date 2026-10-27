import React from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { useTheme } from "../../src/context/ThemeContext";
import { Header } from "../../src/components/Header";

export default function TermsScreen() {
  const { colors, typography, spacing } = useTheme();

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Header title="Terms of Service" showBack />
      <ScrollView contentContainerStyle={{ padding: spacing.base, paddingBottom: 60 }}>
        <Text style={[typography.title1, { color: colors.text }]}>Terms of Service</Text>
        <Text style={[typography.caption, { color: colors.textMuted, marginTop: 4 }]}>
          Last updated: October 26, 2026 · Ploonu LLC
        </Text>

        <View style={{ marginTop: spacing.md, gap: 16 }}>
          <View>
            <Text style={[typography.headline, { color: colors.text }]}>1. Overview</Text>
            <Text style={[typography.body, { color: colors.textSecondary, marginTop: 4, lineHeight: 22 }]}>
              MergeMate is provided by Ploonu LLC as an intelligent companion for GitHub pull request triage and automated risk assessment. By connecting your GitHub account or using MergeMate, you agree to these terms.
            </Text>
          </View>

          <View>
            <Text style={[typography.headline, { color: colors.text }]}>2. Read-Only GitHub Authorization</Text>
            <Text style={[typography.body, { color: colors.textSecondary, marginTop: 4, lineHeight: 22 }]}>
              MergeMate requests strictly read-only GitHub App permissions. MergeMate will never merge, approve, comment, commit, or close pull requests or repositories on your behalf.
            </Text>
          </View>

          <View>
            <Text style={[typography.headline, { color: colors.text }]}>3. User Data & Zero Code Storage</Text>
            <Text style={[typography.body, { color: colors.textSecondary, marginTop: 4, lineHeight: 22 }]}>
              We do not store your repository source code or history. Patch diffs are inspected in memory for AI evaluation and immediately discarded. Access tokens remain encrypted at rest using server-side keys.
            </Text>
          </View>

          <View>
            <Text style={[typography.headline, { color: colors.text }]}>4. Subscriptions & Cancellation</Text>
            <Text style={[typography.body, { color: colors.textSecondary, marginTop: 4, lineHeight: 22 }]}>
              Pro subscriptions are processed via Stripe. You can cancel at any time through the customer portal, and your plan remains active until the end of the billing cycle.
            </Text>
          </View>

          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <Text style={[typography.caption, { color: colors.textMuted }]}>
              Ploonu LLC · 1007 N Orange St, Wilmington, DE · support@mergemate.dev
            </Text>
          </View>
        </View>
      </ScrollView>
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
