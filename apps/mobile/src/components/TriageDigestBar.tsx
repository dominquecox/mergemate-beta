import React from "react";
import { View } from "react-native";
import { Text } from "./Text";
import { useTheme } from "../context/ThemeContext";
import type { TriageItem } from "../types";
import { triageDigest } from "../workspace/triageDigest";

export function TriageDigestBar({ queue }: { queue: readonly TriageItem[] }) {
  const { colors, typography, radius } = useTheme();
  const d = triageDigest(queue);
  const chip = (label: string, n: number, color: string) => (
    <View key={label} style={{ flexDirection: "row", gap: 4, alignItems: "baseline", paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full, backgroundColor: colors.surfaceElevated }}>
      <Text style={[typography.subhead, { color, fontWeight: "700" }]}>{n}</Text>
      <Text style={[typography.caption, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
  return (
    <View testID="triage-digest" accessibilityRole="summary" accessibilityLabel={d.sentence} style={{ gap: 8, marginBottom: 8 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {chip("Needs you", d.needsYou, colors.brandLight)}
        {chip("FYI", d.fyi, colors.riskMedium)}
        {chip("Ignore", d.ignore, colors.textSecondary)}
      </View>
      <Text style={[typography.footnote, { color: colors.textSecondary }]}>{d.sentence}</Text>
    </View>
  );
}
