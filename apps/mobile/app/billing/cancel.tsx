import React, { useState } from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { useRouter, Redirect } from "expo-router";
import { useTheme } from "../../src/context/ThemeContext";
import { Header } from "../../src/components/Header";
import { Button } from "../../src/components/Button";
import { EmptyState } from "../../src/components/EmptyState";
import { ErrorState } from "../../src/components/ErrorState";
import { LoadingState } from "../../src/components/LoadingState";

export default function BillingCancelScreen() {
  if (Platform.OS !== "web") {
    return <Redirect href="/(tabs)/settings" />;
  }

  const router = useRouter();
  const { colors, typography, spacing } = useTheme();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const handleReturn = () => {
    try {
      setIsLoading(true);
      setError(null);
      router.replace("/billing");
    } catch (e: any) {
      setIsLoading(false);
      setError(e.message || "We couldn't return to the billing page. Please try again.");
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Header title="Checkout Cancelled" />
      {isLoading ? (
        <LoadingState title="Returning to billing..." message="Restoring your plan options." />
      ) : error ? (
        <ErrorState title="Navigation failed" message={error} onRetry={handleReturn} />
      ) : dismissed ? (
        <EmptyState
          icon="ℹ️"
          title="Checkout cancelled"
          message="Your account remains on the Free plan."
          actionTitle="Back to Billing"
          onAction={() => {
            setDismissed(false);
            handleReturn();
          }}
        />
      ) : (
        <View style={[styles.content, { padding: spacing.xl }]}>
          <Text style={{ fontSize: 48 }}>ℹ️</Text>
          <Text
            style={[typography.title1, { color: colors.text, marginTop: spacing.md, textAlign: "center" }]}
            accessibilityRole="header"
          >
            Checkout Not Completed
          </Text>
          <Text
            style={[
              typography.body,
              { color: colors.textSecondary, marginTop: spacing.xs, textAlign: "center", maxWidth: 320 },
            ]}
          >
            No payment was processed. Your account remains on the Free plan.
          </Text>

          <Button
            title="Back to Billing"
            onPress={handleReturn}
            variant="secondary"
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
