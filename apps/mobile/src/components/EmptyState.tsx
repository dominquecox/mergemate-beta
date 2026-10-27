import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { Button } from "./Button";

interface EmptyStateProps {
  icon?: string;
  title: string;
  message: string;
  actionTitle?: string;
  onAction?: () => void;
}

export function EmptyState({ icon = "✦", title, message, actionTitle, onAction }: EmptyStateProps) {
  const { colors, typography, spacing } = useTheme();

  return (
    <View style={[styles.container, { padding: spacing.xxl }]}>
      <Text style={[styles.icon, { color: colors.textMuted }]}>{icon}</Text>
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
      {actionTitle && onAction && (
        <Button title={actionTitle} onPress={onAction} variant="secondary" />
      )}
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
