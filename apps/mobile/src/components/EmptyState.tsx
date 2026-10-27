import React from "react";
import { View, StyleSheet } from "react-native";
import { Text } from "./Text";
import { useTheme } from "../context/ThemeContext";
import { Button } from "./Button";
import { Icon, IconName } from "./Icon";

interface EmptyStateProps {
  icon?: IconName;
  title: string;
  message: string;
  actionTitle?: string;
  onAction?: () => void;
}

export function EmptyState({ icon = "sparkles-outline", title, message, actionTitle, onAction }: EmptyStateProps) {
  const { colors, typography, spacing } = useTheme();

  return (
    <View style={[styles.container, { padding: spacing.xxl }]}>
      <Icon name={icon} size={40} color={colors.textMuted} />
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
});
