import React from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { useRouter, Redirect } from "expo-router";
import { useTheme } from "../../src/context/ThemeContext";
import { Header } from "../../src/components/Header";
import { Button } from "../../src/components/Button";

export default function BillingSuccessScreen() {
  if (Platform.OS !== "web") {
    return <Redirect href="/(tabs)/settings" />;
  }

  const router = useRouter();
  const { colors, typography, spacing } = useTheme();

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Header title="Upgrade Complete" />
      <View style={[styles.content, { padding: spacing.xl }]}>
        <Text style={{ fontSize: 48 }}>🎉</Text>
        <Text style={[typography.title1, { color: colors.text, marginTop: spacing.md, textAlign: "center" }]}>
          Welcome to MergeMate Pro!
        </Text>
        <Text
          style={[
            typography.body,
            { color: colors.textSecondary, marginTop: spacing.xs, textAlign: "center", maxWidth: 300 },
          ]}
        >
          Enjoy more AI summaries and risk checks every day, triage deck, secret alerts, and live pull request updates.
        </Text>

        <Button
          title="Return to Inbox"
          onPress={() => router.replace("/(tabs)/inbox")}
          variant="primary"
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
