import React, { useState } from "react";
import { TouchableOpacity, View } from "react-native";
import { Text } from "./Text";
import { useTheme } from "../context/ThemeContext";
import { clampTourStep, DEMO_TOUR_STEPS } from "../workspace/tour";

export function DemoTour({ onClose }: { onClose: () => void }) {
  const { colors, typography, radius, spacing } = useTheme();
  const [step, setStep] = useState(0);
  const current = DEMO_TOUR_STEPS[clampTourStep(step)];
  const last = step >= DEMO_TOUR_STEPS.length - 1;
  const button = (label: string, onPress: () => void, primary = false) => (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ minHeight: 44, minWidth: 64, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: primary ? colors.brandLight : colors.surfaceElevated }}>
      <Text style={[typography.footnote, { color: primary ? colors.background : colors.text, fontWeight: "600" }]}>{label}</Text>
    </TouchableOpacity>
  );
  return (
    <View testID="demo-tour" accessibilityRole="summary" style={{ padding: 12, marginBottom: spacing.sm, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.demoBadge, backgroundColor: colors.demoBadgeBg, gap: 6 }}>
      <Text style={[typography.subhead, { color: colors.demoBadge, fontWeight: "700" }]} accessibilityRole="header">{current.title}</Text>
      <Text style={[typography.footnote, { color: colors.text }]}>{current.body}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
        {step > 0 && button("Back", () => setStep((s) => clampTourStep(s - 1)))}
        {!last && button("Next", () => setStep((s) => clampTourStep(s + 1)), true)}
        {last && button("Done", onClose, true)}
        {button("Restart", () => setStep(0))}
        {!last && button("Skip", onClose)}
      </View>
    </View>
  );
}
