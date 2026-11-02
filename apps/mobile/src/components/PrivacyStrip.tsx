import React, { useState } from "react";
import { TouchableOpacity, View } from "react-native";
import { Text } from "./Text";
import { Icon } from "./Icon";
import { PRIVACY_FACTS } from "../workspace/privacy";
import { useTheme } from "../context/ThemeContext";

export function PrivacyStrip({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { colors, typography, radius, spacing } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View testID="privacy-strip" style={{ marginBottom: spacing.xs }}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Read-only. MergeMate cannot merge, approve or comment. What we send to the model"
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        onPress={() => setOpen((v) => !v)}
        style={{
          minHeight:44,minWidth:44,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: radius.full,

          alignSelf: "flex-start",
        }}
      >
        <Icon name="lock-closed" size={12} color={colors.riskLow} />
        <Text style={[typography.caption, { color: colors.textSecondary }]}>Read-only · You stay in control</Text>
        <Icon name={open ? "chevron-up" : "chevron-down"} size={13} color={colors.textSecondary} />
      </TouchableOpacity>
      {open && (
        <View testID="privacy-sheet" style={{ padding: 12, gap: 8, marginTop: 4, backgroundColor: colors.surfaceElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }}>
          <Text style={[typography.subhead, { color: colors.text, fontWeight: "600" }]} accessibilityRole="header">What we send to the model</Text>
          {PRIVACY_FACTS.map((fact) => (
            <View key={fact} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
              <Icon name="checkmark" size={14} color={colors.riskLow} style={{ marginTop: 2 }} />
              <Text style={[typography.footnote, { color: colors.textSecondary, flex: 1, lineHeight: 18 }]}>{fact}</Text>
            </View>
          ))}
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open Settings to manage AI choices or delete your data" onPress={onOpenSettings} style={{ minHeight: 44, justifyContent: "center" }}>
            <Text style={[typography.footnote, { color: colors.brandLight, textDecorationLine: "underline" }]}>Manage AI choices or delete my data</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
