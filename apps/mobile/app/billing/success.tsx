import React, { useState } from "react";
import { View, StyleSheet, Platform } from "react-native";
import { Text } from "../../src/components/Text";
import { useRouter, Redirect } from "expo-router";
import { useTheme } from "../../src/context/ThemeContext";
import { Header } from "../../src/components/Header";
import { Button } from "../../src/components/Button";
import { EmptyState } from "../../src/components/EmptyState";
import { ErrorState } from "../../src/components/ErrorState";
import { LoadingState } from "../../src/components/LoadingState";
import { Icon } from "../../src/components/Icon";

export default function BillingSuccessScreen() {
  if (Platform.OS !== "web") {
    return <Redirect href="/(tabs)/settings" />;
  }

  const router = useRouter();
  const { colors, typography, spacing } = useTheme();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasPlan, setHasPlan] = useState(true);

  const handleContinue = () => {
    try {
      setIsLoading(true);
      setError(null);
      router.replace("/(tabs)/inbox");
    } catch (e: any) {
      setIsLoading(false);
      setError(e.message || "We couldn't open your inbox right now. Please try again.");
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Header title="Upgrade Complete" />
      {isLoading ? (
        <LoadingState title="Opening your inbox..." message="Activating your MergeMate Pro workspace." />
      ) : error ? (
        <ErrorState title="Couldn't open inbox" message={error} onRetry={handleContinue} />
      ) : !hasPlan ? (
        <EmptyState
          icon="card-outline"
          title="No active checkout found"
          message="Return to the billing page to view your current subscription."
          actionTitle="View Plans"
          onAction={() => {
            setHasPlan(true);
            router.replace("/billing");
          }}
        />
      ) : (
        <View style={[styles.content, { padding: spacing.xl }]}>
          <Icon name="checkmark-circle" size={52} color={colors.riskLow} />
          <Text
            style={[typography.title1, { color: colors.text, marginTop: spacing.md, textAlign: "center" }]}
            accessibilityRole="header"
          >
            Welcome to MergeMate Pro!
          </Text>
          <Text
            style={[
              typography.body,
              { color: colors.textSecondary, marginTop: spacing.xs, textAlign: "center", maxWidth: 320 },
            ]}
          >
            Enjoy more AI summaries and risk checks every day, triage deck, secret alerts, and live pull request updates.
          </Text>

          <Button
            title="Return to Inbox"
            onPress={handleContinue}
            variant="primary"
            style={{ width: "100%", maxWidth: 320, marginTop: spacing.xl }}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
