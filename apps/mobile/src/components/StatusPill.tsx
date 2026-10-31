import React from "react";
import { View, StyleSheet } from "react-native";
import { Text } from "./Text";
import { Icon, IconName } from "./Icon";
import { useTheme } from "../context/ThemeContext";
import { PrStatus } from "../types";

export function StatusPill({ status }: { status: PrStatus }) {
  const { colors, typography, radius } = useTheme();

  let bg = colors.surfaceSecondary;
  let text = colors.textSecondary;
  let iconName: IconName = "ellipse";
  let label = "OPEN";

  if (status === "open") {
    bg = colors.riskLowBg;
    text = colors.riskLow;
    iconName = "git-pull-request-outline";
    label = "OPEN";
  } else if (status === "merged") {
    bg = colors.brandSubtle;
    text = colors.brandLight;
    iconName = "git-merge-outline";
    label = "MERGED";
  } else if (status === "closed") {
    bg = colors.riskHighBg;
    text = colors.riskHigh;
    iconName = "close-circle-outline";
    label = "CLOSED";
  }

  return (
    <View style={[styles.pill, { backgroundColor: bg, borderColor: text + "33", borderRadius: radius.full }]}>
      <Icon name={iconName} size={11} color={text} />
      <Text style={[typography.caption, { color: text, fontWeight: "700", letterSpacing: 0.5, fontSize: 11 }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
});
