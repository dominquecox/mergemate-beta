import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { PrStatus } from "../types";

export function StatusPill({ status }: { status: PrStatus }) {
  const { colors, typography, radius } = useTheme();

  let bg = colors.surfaceSecondary;
  let text = colors.textSecondary;
  const label = status.toUpperCase();

  if (status === "open") {
    bg = colors.riskLowBg;
    text = colors.riskLow;
  } else if (status === "merged") {
    bg = colors.brandSubtle;
    text = colors.brandLight;
  } else if (status === "closed") {
    bg = colors.riskHighBg;
    text = colors.riskHigh;
  }

  return (
    <View style={[styles.pill, { backgroundColor: bg, borderRadius: radius.sm }]}>
      <Text style={[typography.caption, { color: text, fontWeight: "700", letterSpacing: 0.5 }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
});
