import React, { useState } from "react";
import { Pressable, View } from "react-native";
import type { PrFile } from "../types";
import { useTheme } from "../context/ThemeContext";
import { detectBlastRadius, type BlastDomain } from "../workspace/blastRadius";
import { Icon } from "./Icon";
import { Text } from "./Text";

export function BlastRadiusChips({ files, inline = false }: { files: readonly PrFile[]; inline?: boolean }) {
  const { colors, typography, radius, spacing } = useTheme();
  const domains = detectBlastRadius(files);
  const [selected, setSelected] = useState<BlastDomain | null>(null);

  if (domains.length === 0) return null;

  return (
    <View
      style={
        inline
          ? { marginTop: 4, marginBottom: 4 }
          : {
              marginTop: spacing.sm,
              padding: spacing.base,
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderWidth: 1,
              borderRadius: radius.lg,
            }
      }
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <Icon name="flash-outline" size={14} color={colors.brandLight} />
        <Text style={[typography.subhead, { color: colors.text, fontWeight: "600" }]} accessibilityRole="header">
          Blast Radius Analysis
        </Text>
      </View>

      {/* Domain Chips */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {domains.map((domain) => {
          const isSelected = selected?.id === domain.id;
          const badgeBg =
            domain.severity === "high"
              ? colors.riskHigh
              : domain.severity === "medium"
              ? colors.riskMedium
              : colors.border;

          return (
            <Pressable
              key={domain.id}
              accessibilityRole="button"
              accessibilityLabel={`${domain.label}, ${domain.files.length} files affected, ${domain.severity} severity`}
              accessibilityState={{ selected: isSelected }}
              onPress={() => setSelected(isSelected ? null : domain)}
              style={({ pressed }) => [
                {
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  minHeight: 44,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: isSelected ? colors.brandLight : colors.border,
                  backgroundColor: isSelected ? colors.surfaceSecondary : colors.surface,
                },
                pressed && { opacity: 0.8 },
              ]}
            >
              <Icon name={domain.icon} size={15} color={isSelected ? colors.brandLight : colors.textMuted} />
              <Text
                style={[
                  typography.callout,
                  { color: isSelected ? colors.brandLight : colors.text, fontWeight: "600" },
                ]}
              >
                {domain.label}
              </Text>
              <View
                style={{
                  minWidth: 20,
                  height: 20,
                  borderRadius: 10,
                  backgroundColor: badgeBg,
                  alignItems: "center",
                  justifyContent: "center",
                  paddingHorizontal: 4,
                }}
              >
                <Text
                  style={[
                    typography.caption,
                    {
                      color: domain.severity === "high" || domain.severity === "medium" ? "#000" : colors.text,
                      fontSize: 11,
                      fontWeight: "700",
                    },
                  ]}
                >
                  {domain.files.length}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* Selected Domain Detail Accordion */}
      {selected && (
        <View
          style={{
            marginTop: 12,
            padding: 10,
            backgroundColor: colors.surfaceSecondary,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.border,
          }}
          accessibilityLiveRegion="polite"
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <Icon name={selected.icon} size={14} color={colors.brandLight} />
            <Text style={[typography.subhead, { color: colors.text, fontWeight: "600" }]}>
              {selected.label} ({selected.files.length} files)
            </Text>
          </View>
          <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: 8 }]}>
            {selected.summary}
          </Text>
          <View style={{ gap: 6 }}>
            {selected.files.map((file) => (
              <View
                key={file}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  paddingVertical: 4,
                  paddingHorizontal: 8,
                  backgroundColor: colors.surfaceElevated,
                  borderRadius: radius.sm,
                  alignSelf: "flex-start",
                }}
              >
                <Icon name="document-text-outline" size={12} color={colors.brandLight} />
                <Text selectable style={[typography.code, { color: colors.text, fontSize: 12 }]}>
                  {file}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}
