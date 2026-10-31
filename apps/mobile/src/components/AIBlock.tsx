import React, { useEffect, useRef, useState } from "react";
import { Animated, View, TouchableOpacity, StyleSheet } from "react-native";
import { Text } from "./Text";
import { useRouter } from "expo-router";
import { useTheme } from "../context/ThemeContext";
import { useConsent } from "../context/ConsentContext";
import { AnalysisCoverage } from "../types";
import { Icon } from "./Icon";
import { modelDisplayName } from "../format/model";
import { useReducedMotion } from "../hooks/useReducedMotion";

interface AIBlockProps {
  title?: string;
  children: React.ReactNode;
  coverage?: AnalysisCoverage;
  cachedTime?: string;
  /** `provider:model` of the model that wrote this block. */
  model?: string;
}

export function AIBlock({
  title = "AI Summary",
  children,
  coverage,
  cachedTime,
  model,
}: AIBlockProps) {
  const { colors, typography, spacing, radius } = useTheme();
  const router = useRouter();
  const { aiConsentGranted, aiSummaries } = useConsent();
  const [voted, setVoted] = useState<"up" | "down" | null>(null);

  if (!aiConsentGranted || !aiSummaries) {
    const needsConsent = !aiConsentGranted;
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
          {needsConsent
            ? "AI summaries are off. Read what would be sent to an AI model, then choose."
            : "AI summaries and risk are turned off in Settings."}
        </Text>
        <TouchableOpacity
          onPress={() => router.push(needsConsent ? "/(auth)/consent" : "/(tabs)/settings")}
          style={[styles.turnOnBtn, { backgroundColor: colors.brand, borderRadius: radius.md }]}
          accessibilityRole="button"
          accessibilityLabel={needsConsent ? "Review AI consent" : "Open AI settings"}
        >
          <Text style={[typography.subhead, { color: "#FFFFFF", fontWeight: "600" }]}>
            {needsConsent ? "Review and turn on AI" : "Open Settings"}
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
          {!!cachedTime && (
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

      <View style={{marginTop:12,gap:10}}>{children}</View>

      {coverage && (
        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          <Text style={[typography.caption, { color: colors.textMuted }]}>
            Analyzed {coverage.analyzedFiles} files · {coverage.skippedFiles} skipped · {coverage.truncatedFiles} truncated{modelDisplayName(model) ? ` · ${modelDisplayName(model)}` : ""}
          </Text>
        </View>
      )}
    </View>
  );
}

/** Placeholder while the summary is generated; a slow pulse unless the person prefers reduced motion. */
export function AIBlockSkeleton() {
  const { colors, typography, spacing, radius } = useTheme();
  const reduced = useReducedMotion();
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduced) { pulse.setValue(1); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.45, duration: 800, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [reduced, pulse]);
  const bar = (width: `${number}%`) => (
    <Animated.View style={{ height: 10, width, borderRadius: radius.sm, backgroundColor: colors.surfaceElevated, opacity: pulse }} />
  );
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Writing the AI summary"
      accessibilityLiveRegion="polite"
      style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.base }]}
    >
      <View style={styles.titleRow}>
        <Icon name="sparkles" size={14} color={colors.brandLight} />
        <Text style={[typography.subhead, { color: colors.brandLight, fontWeight: "600" }]}>AI Summary</Text>
        <Text style={[typography.caption, { color: colors.textMuted }]}>Reading the pull request...</Text>
      </View>
      <View style={{ marginTop: 14, gap: 10 }}>{bar("92%")}{bar("100%")}{bar("64%")}</View>
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
