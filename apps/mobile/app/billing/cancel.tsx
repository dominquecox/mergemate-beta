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
          icon="information-circle-outline"
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
          <Icon name="information-circle-outline" size={52} color={colors.brandLight} />
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
