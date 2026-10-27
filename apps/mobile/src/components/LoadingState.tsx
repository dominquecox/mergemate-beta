import React from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { Text } from "./Text";
import { useTheme } from "../context/ThemeContext";

interface LoadingStateProps {
  title?: string;
  message?: string;
}

export function LoadingState({
  title = "Loading...",
  message = "Please wait a moment while we fetch the latest data.",
}: LoadingStateProps) {
  const { colors, typography, spacing } = useTheme();

  return (
    <View
      style={[styles.container, { padding: spacing.xxl }]}
      accessibilityRole="progressbar"
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${title}. ${message}`}
    >
      <ActivityIndicator size="large" color={colors.brandLight} />
      <Text style={[typography.headline, { color: colors.text, marginTop: spacing.md, textAlign: "center" }]}>
        {title}
      </Text>
      <Text
        style={[
          typography.body,
          { color: colors.textSecondary, marginTop: spacing.xs, textAlign: "center", maxWidth: 300 },
        ]}
      >
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 220,
  },
});
