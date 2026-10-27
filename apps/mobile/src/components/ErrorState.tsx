import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { Button } from "./Button";

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = "Something went wrong",
  message = "Could not load data. Check your connection and try again.",
  onRetry,
}: ErrorStateProps) {
  const { colors, typography, spacing } = useTheme();

  return (
    <View style={[styles.container, { padding: spacing.xxl }]}>
      <Text style={[styles.icon, { color: colors.riskHigh }]}>⚠</Text>
      <Text style={[typography.title2, { color: colors.text, marginTop: spacing.md, textAlign: "center" }]}>
        {title}
      </Text>
      <Text
        style={[
          typography.body,
          { color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.lg, textAlign: "center" },
        ]}
      >
        {message}
      </Text>
      {onRetry && <Button title="Try Again" onPress={onRetry} variant="secondary" />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 240,
  },
  icon: {
    fontSize: 36,
  },
});
