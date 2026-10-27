import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { useConsent } from "../context/ConsentContext";
import { AnalysisCoverage } from "../types";

interface AIBlockProps {
  title?: string;
  children: React.ReactNode;
  coverage?: AnalysisCoverage;
  cachedTime?: string;
}

export function AIBlock({
  title = "AI Summary",
  children,
  coverage,
  cachedTime,
}: AIBlockProps) {
  const { colors, typography, spacing, radius } = useTheme();
  const { aiConsentGranted, grantConsent } = useConsent();
  const [voted, setVoted] = useState<"up" | "down" | null>(null);

  if (!aiConsentGranted) {
    return (
      <View
        style={[
          styles.container,
          {
            backgroundColor: colors.surfaceElevated,
            borderColor: colors.border,
            borderRadius: radius.lg,
            padding: spacing.base,
          },
        ]}
      >
        <View style={styles.header}>
          <Text style={styles.sparkle}>✦</Text>
          <Text style={[typography.subhead, { color: colors.textSecondary }]}>
            AI Insights Off
          </Text>
        </View>
        <Text style={[typography.body, { color: colors.text, marginVertical: spacing.sm }]}>
          Enable AI summaries to review diffs and risk factors in seconds.
        </Text>
        <TouchableOpacity
          onPress={grantConsent}
          style={[styles.turnOnBtn, { backgroundColor: colors.brand, borderRadius: radius.md }]}
        >
          <Text style={[typography.subhead, { color: "#FFFFFF", fontWeight: "600" }]}>
            Turn on AI Insights
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: radius.lg,
          padding: spacing.base,
        },
      ]}
    >
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={[styles.sparkle, { color: colors.brandLight }]}>✦</Text>
          <Text style={[typography.subhead, { color: colors.brandLight, fontWeight: "600" }]}>
            {title}
          </Text>
        </View>
        <View style={styles.actionsRow}>
          {cachedTime && (
            <Text style={[typography.caption, { color: colors.textMuted }]}>
              {cachedTime}
            </Text>
          )}
          <TouchableOpacity
            onPress={() => setVoted(voted === "up" ? null : "up")}
            style={styles.voteBtn}
            accessibilityLabel="Helpful summary"
          >
            <Text style={{ color: voted === "up" ? colors.brandLight : colors.textMuted, fontSize: 13 }}>
              👍
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setVoted(voted === "down" ? null : "down")}
            style={styles.voteBtn}
            accessibilityLabel="Unhelpful summary"
          >
            <Text style={{ color: voted === "down" ? colors.riskHigh : colors.textMuted, fontSize: 13 }}>
              👎
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ marginVertical: spacing.sm }}>{children}</View>

      {coverage && (
        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          <Text style={[typography.caption, { color: colors.textMuted }]}>
            Analyzed {coverage.analyzedFiles} files · {coverage.skippedFiles} skipped · {coverage.truncatedFiles} truncated
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    marginVertical: 6,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sparkle: {
    fontSize: 14,
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  voteBtn: {
    padding: 4,
  },
  turnOnBtn: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 4,
  },
  footer: {
    borderTopWidth: 1,
    paddingTop: 8,
    marginTop: 6,
  },
});
