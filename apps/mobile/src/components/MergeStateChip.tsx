import React from "react";
import { View, StyleSheet } from "react-native";
import { Text } from "./Text";
import { Icon, type IconName } from "./Icon";
import { useTheme } from "../context/ThemeContext";
import type { MergeState } from "../types";

/** GitHub's merge status, read-only. "unknown" means GitHub is still checking; it is never shown as ready. */
export const MERGE_STATE_COPY: Record<MergeState, { label: string; icon: IconName; tone: "low" | "medium" | "high" | "neutral" }> = {
  clean: { label: "Ready to merge", icon: "checkmark-circle", tone: "low" },
  conflicts: { label: "Has conflicts", icon: "git-compare", tone: "high" },
  blocked: { label: "Merge blocked", icon: "lock-closed", tone: "medium" },
  behind: { label: "Behind base", icon: "arrow-down-circle", tone: "medium" },
  unstable: { label: "Checks failing", icon: "alert-circle", tone: "medium" },
  unknown: { label: "Checking merge status", icon: "time-outline", tone: "neutral" },
};

export function MergeStateChip({ state }: { state: MergeState }) {
  const { colors, typography, radius } = useTheme();
  const copy = MERGE_STATE_COPY[state];
  const tone = {
    low: { bg: colors.riskLowBg, fg: colors.riskLow },
    medium: { bg: colors.riskMediumBg, fg: colors.riskMedium },
    high: { bg: colors.riskHighBg, fg: colors.riskHigh },
    neutral: { bg: colors.surfaceSecondary, fg: colors.textSecondary },
  }[copy.tone];
  return (
    <View
      style={[styles.chip, { backgroundColor: tone.bg, borderRadius: radius.full }]}
      accessibilityRole="text"
      accessibilityLabel={`Merge status: ${copy.label}`}
    >
      <Icon name={copy.icon} size={14} color={tone.fg} />
      <Text style={[typography.caption, { color: tone.fg, fontWeight: "700" }]}>{copy.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 4, alignSelf: "flex-start" },
});
