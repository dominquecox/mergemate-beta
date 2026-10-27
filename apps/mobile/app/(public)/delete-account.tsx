import React, { useState } from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "../../src/context/ThemeContext";
import { Header } from "../../src/components/Header";
import { Button } from "../../src/components/Button";
import { Card } from "../../src/components/Card";
import { EmptyState } from "../../src/components/EmptyState";
import { ErrorState } from "../../src/components/ErrorState";
import { LoadingState } from "../../src/components/LoadingState";

export default function PublicDeleteAccountScreen() {
  const router = useRouter();
  const { colors, typography, spacing } = useTheme();
  const [isLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showInstructions] = useState(true);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Header title="Account Deletion" showBack />
      {isLoading ? (
        <LoadingState title="Loading account deletion guide..." message="Preparing instructions." />
      ) : error ? (
        <ErrorState title="Couldn't load instructions" message={error} onRetry={() => setError(null)} />
      ) : !showInstructions ? (
        <EmptyState icon="🗑" title="Instructions unavailable" message="Email support@mergemate.dev to request account deletion." />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.base, paddingBottom: 60 }}>
          <Text style={[typography.title1, { color: colors.text }]} accessibilityRole="header">
            How to Delete Your Account
          </Text>
          <Text style={[typography.body, { color: colors.textSecondary, marginTop: 4 }]}>
            MergeMate respects your data rights. You can delete your account and all associated tokens at any time.
          </Text>

          <Card style={{ marginTop: spacing.lg }}>
            <Text style={[typography.headline, { color: colors.text }]} accessibilityRole="header">
              Option 1: In the App
            </Text>
            <Text style={[typography.callout, { color: colors.textSecondary, marginTop: 4, lineHeight: 20 }]}>
              Open MergeMate → Settings → scroll to the bottom → tap "Delete Account & Revoke Access".
            </Text>

            <Button
              title="Open Account Deletion Sheet"
              onPress={() => router.push("/account/delete")}
              variant="destructive"
              style={{ marginTop: spacing.md }}
            />
          </Card>

          <Card style={{ marginTop: spacing.base }}>
            <Text style={[typography.headline, { color: colors.text }]} accessibilityRole="header">
              Option 2: Direct Support Request
            </Text>
            <Text style={[typography.callout, { color: colors.textSecondary, marginTop: 4, lineHeight: 20 }]}>
              If you cannot log in, email <Text style={{ color: colors.brandLight }}>support@mergemate.dev</Text> from the email tied to your GitHub account with the subject "Delete Account". All associated data will be removed within 24 hours.
            </Text>
          </Card>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
