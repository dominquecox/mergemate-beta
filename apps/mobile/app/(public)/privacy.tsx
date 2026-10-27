import React from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { useTheme } from "../../src/context/ThemeContext";
import { Header } from "../../src/components/Header";

export default function PrivacyScreen() {
  const { colors, typography, spacing } = useTheme();

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Header title="Privacy Policy" showBack />
      <ScrollView contentContainerStyle={{ padding: spacing.base, paddingBottom: 60 }}>
        <Text style={[typography.title1, { color: colors.text }]}>Privacy Policy</Text>
        <Text style={[typography.caption, { color: colors.textMuted, marginTop: 4 }]}>
          Effective date: October 26, 2026 · Ploonu LLC
        </Text>

        <View style={{ marginTop: spacing.md, gap: 16 }}>
          <View>
            <Text style={[typography.headline, { color: colors.text }]}>1. Read-Only Scope</Text>
            <Text style={[typography.body, { color: colors.textSecondary, marginTop: 4, lineHeight: 22 }]}>
              MergeMate operates strictly on read-only permissions granted through the official GitHub App integration. You choose which individual repositories or organizations MergeMate can see.
            </Text>
          </View>

          <View>
            <Text style={[typography.headline, { color: colors.text }]}>2. Automated Secret Redaction</Text>
            <Text style={[typography.body, { color: colors.textSecondary, marginTop: 4, lineHeight: 22 }]}>
              Before any patch diff is sent to AI models for evaluation, automated pattern scanners identify potential secrets (API tokens, private keys, connection strings) and mask them with [REDACTED]. Raw secrets are never sent to external AI providers.
            </Text>
          </View>

          <View>
            <Text style={[typography.headline, { color: colors.text }]}>3. Zero Code Retention</Text>
            <Text style={[typography.body, { color: colors.textSecondary, marginTop: 4, lineHeight: 22 }]}>
              Your source code is never permanently stored on our servers and is never used to train frontier AI models. Only high-level review metadata and summaries are cached in memory for your session.
            </Text>
          </View>

          <View>
            <Text style={[typography.headline, { color: colors.text }]}>4. Right to Deletion</Text>
            <Text style={[typography.body, { color: colors.textSecondary, marginTop: 4, lineHeight: 22 }]}>
              You have the right to delete your account at any time. Account deletion immediately revokes the GitHub grant, purges cached review metadata, and ends all active sessions.
            </Text>
          </View>

          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <Text style={[typography.caption, { color: colors.textMuted }]}>
              Questions? Contact privacy@mergemate.dev · Ploonu LLC
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
