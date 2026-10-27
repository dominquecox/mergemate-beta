import React, { useState } from "react";
import { View, TouchableOpacity, StyleSheet } from "react-native";
import { Text } from "./Text";
import { useTheme } from "../context/ThemeContext";
import { useConsent } from "../context/ConsentContext";
import { AnalysisCoverage } from "../types";
import { Icon } from "./Icon";

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
          <Icon name="sparkles" size={14} color={colors.textMuted} />
          <Text style={[typography.subhead, { color: colors.textSecondary }]}>
            AI Insights Off
          </Text>
        </View>
        <Text style={[typography.body, { color: colors.text, marginVertical: spacing.sm }]}>
          Turn on AI summaries to see what changed and why it matters in seconds.
        </Text>
        <TouchableOpacity
          onPress={grantConsent}
          style={[styles.turnOnBtn, { backgroundColor: colors.brand, borderRadius: radius.md }]}
          accessibilityRole="button"
          accessibilityLabel="Turn on AI Insights"
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
          <Icon name="sparkles" size={14} color={colors.brandLight} />
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
            accessibilityRole="button"
            accessibilityLabel="Mark summary as helpful"
            accessibilityState={{ selected: voted === "up" }}
          >
            <Icon
              name={voted === "up" ? "thumbs-up" : "thumbs-up-outline"}
              size={18}
              color={voted === "up" ? colors.brandLight : colors.textMuted}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setVoted(voted === "down" ? null : "down")}
            style={styles.voteBtn}
            accessibilityRole="button"
            accessibilityLabel="Mark summary as not helpful"
            accessibilityState={{ selected: voted === "down" }}
          >
            <Icon
              name={voted === "down" ? "thumbs-down" : "thumbs-down-outline"}
              size={18}
              color={voted === "down" ? colors.riskHigh : colors.textMuted}
            />
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
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  voteBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  turnOnBtn: {
    alignSelf: "flex-start",
    minHeight: 44,
    paddingHorizontal: 14,
    justifyContent: "center",
    marginTop: 4,
  },
  footer: {
    borderTopWidth: 1,
    paddingTop: 8,
    marginTop: 6,
  },
});
