import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { RiskLevel, SecretLeakWarning } from "../types";

interface RiskBadgeProps {
  level: RiskLevel;
  secretWarning?: SecretLeakWarning;
  compact?: boolean;
}

export function RiskBadge({ level, secretWarning, compact }: RiskBadgeProps) {
  const { colors, typography, radius } = useTheme();

  // If there is a secret leak, override level to high with secret-warning accent
  const isSecretLeak = Boolean(secretWarning);
  const effectiveLevel = isSecretLeak ? "high" : level;

  let bg = colors.riskLowBg;
  let text = colors.riskLow;
  let icon = "✓";
  let label = "Low risk";

  if (effectiveLevel === "medium") {
    bg = colors.riskMediumBg;
    text = colors.riskMedium;
    icon = "▲";
    label = "Medium risk";
  } else if (effectiveLevel === "high") {
    bg = isSecretLeak ? colors.secretWarningBg : colors.riskHighBg;
    text = isSecretLeak ? colors.secretWarning : colors.riskHigh;
    icon = isSecretLeak ? "⚠" : "✕";
    label = isSecretLeak ? "Secret Alert · High risk" : "High risk";
  }

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: bg,
          borderRadius: radius.full,
          paddingHorizontal: compact ? 8 : 10,
          paddingVertical: compact ? 2 : 4,
        },
      ]}
      accessibilityRole="text"
      accessibilityLabel={`Risk level: ${label}`}
    >
      <Text style={[styles.icon, { color: text, fontSize: compact ? 10 : 12 }]}>{icon}</Text>
      <Text style={[typography.caption, { color: text, fontWeight: "600" }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
  },
  icon: {
    fontWeight: "700",
  },
});
