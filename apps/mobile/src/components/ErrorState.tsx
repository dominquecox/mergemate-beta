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
      style={[styles.container, { padding: spacing.xl, margin:16, borderRadius:16, borderWidth:1, borderColor:colors.border, backgroundColor:colors.surface }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
    >
      <View style={{width:64,height:64,borderRadius:32,backgroundColor:colors.riskHighBg,alignItems:"center",justifyContent:"center"}}><Icon name="warning-outline" size={28} color={colors.riskHigh}/></View>
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
