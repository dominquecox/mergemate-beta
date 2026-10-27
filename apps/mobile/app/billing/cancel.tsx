import React from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { useRouter, Redirect } from "expo-router";
import { useTheme } from "../../src/context/ThemeContext";
import { Header } from "../../src/components/Header";
import { Button } from "../../src/components/Button";

export default function BillingCancelScreen() {
  if (Platform.OS !== "web") {
    return <Redirect href="/(tabs)/settings" />;
  }

  const router = useRouter();
  const { colors, typography, spacing } = useTheme();

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Header title="Checkout Cancelled" />
      <View style={[styles.content, { padding: spacing.xl }]}>
        <Text style={{ fontSize: 48 }}>ℹ️</Text>
        <Text style={[typography.title1, { color: colors.text, marginTop: spacing.md, textAlign: "center" }]}>
          Checkout Not Completed
        </Text>
        <Text
          style={[
            typography.body,
            { color: colors.textSecondary, marginTop: spacing.xs, textAlign: "center", maxWidth: 300 },
          ]}
        >
          No payment was processed. Your account remains on the Free plan.
        </Text>

        <Button
          title="Back to Billing"
          onPress={() => router.replace("/billing")}
          variant="secondary"
          style={{ width: "100%", marginTop: spacing.xl }}
        />
      </View>
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
