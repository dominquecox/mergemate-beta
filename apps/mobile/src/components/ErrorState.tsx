import React from "react";
import { View, StyleSheet } from "react-native";
import { Text } from "./Text";
import { useTheme } from "../context/ThemeContext";
import { Button } from "./Button";
import { Icon } from "./Icon";

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export function ErrorState({
  title = "Could not load this screen",
  message = "Something went wrong while loading. Please check your connection and try again.",
  onRetry,
  retryLabel = "Try Again",
}: ErrorStateProps) {
  const { colors, typography, spacing } = useTheme();

  return (
    <View
      style={[styles.container, { padding: spacing.xxl }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
    >
      <Icon name="warning-outline" size={40} color={colors.riskHigh} />
      <Text style={[typography.title2, { color: colors.text, marginTop: spacing.md, textAlign: "center" }]}>
        {title}
      </Text>
      <Text
        style={[
          typography.body,
          { color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.lg, textAlign: "center", maxWidth: 320 },
        ]}
      >
        {message}
      </Text>
      {onRetry && <Button title={retryLabel} onPress={onRetry} variant="secondary" />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 240,
  },
});
