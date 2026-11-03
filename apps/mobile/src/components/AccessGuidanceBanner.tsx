import React from "react";
import { View, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Text } from "./Text";
import { Icon } from "./Icon";
import { InfoTip } from "./InfoTip";
import { useTheme } from "../context/ThemeContext";
import { useConsent } from "../context/ConsentContext";
import { useAuth } from "../context/AuthContext";

export interface AccessGuidanceBannerProps {
  /** Optional specific access or capability error to clarify. */
  error?: string | null;
  compact?: boolean;
}

/**
 * Unified semantic banner that clarifies when the user needs to confirm AI processing consent
 * or configure GitHub repository access, using yellow (`statusWarning`) for action-needed consent
 * and red (`statusAlert`) or blue (`statusInfo`) for connection guidance.
 */
export function AccessGuidanceBanner({ error, compact }: AccessGuidanceBannerProps) {
  const { colors, typography, radius } = useTheme();
  const { aiConsentGranted, needsReview, pending } = useConsent();
  const { isDemo } = useAuth();
  const router = useRouter();

  const needsAiConfirm = !isDemo && (!aiConsentGranted || needsReview) && !pending;
  const isGithubAccessIssue =
    typeof error === "string" &&
    /github|access|forbidden|not found|repository|installation|sso|sign in/i.test(error);

  if (!needsAiConfirm && !isGithubAccessIssue) return null;

  const toneColor = isGithubAccessIssue ? colors.statusAlert : colors.statusWarning;
  const toneBg = isGithubAccessIssue ? colors.statusAlertBg : colors.statusWarningBg;

  return (
    <View
      accessibilityRole="alert"
      style={{
        padding: compact ? 10 : 12,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: toneColor,
        backgroundColor: colors.surface,
        borderLeftWidth: 4,
        borderLeftColor: toneColor,
        gap: 8,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
          <View
            style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              backgroundColor: toneBg,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon
              name={isGithubAccessIssue ? "lock-closed-outline" : "sparkles-outline"}
              size={14}
              color={toneColor}
            />
          </View>
          <Text style={[typography.subhead, { color: colors.text, fontWeight: "700", flex: 1 }]}>
            {isGithubAccessIssue
              ? "GitHub repository access needs confirmation"
              : needsReview
                ? "Updated AI consent needs your confirmation"
                : "AI processing is currently off"}
          </Text>
        </View>
        <InfoTip
          title="Why confirmation is required"
          body="MergeMate never widens GitHub repository permissions or sends PR code to an AI model without your explicit consent. Use the buttons below to review AI consent or manage connected GitHub repositories."
        />
      </View>

      <Text style={[typography.caption, { color: colors.textSecondary, lineHeight: 16 }]}>
        {isGithubAccessIssue
          ? `${error} Confirm that the MergeMate GitHub App is installed on this repository or refresh your watched repositories.`
          : "Enable AI processing in your privacy preferences to generate AI summaries, risk assessments, and automated agent workflows."}
      </Text>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {needsAiConfirm && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Confirm AI processing consent"
            onPress={() => router.push("/(auth)/consent")}
            style={({ pressed }) => ({
              minHeight: 34,
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: radius.sm,
              backgroundColor: toneBg,
              borderWidth: 1,
              borderColor: toneColor,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Icon name="checkmark-circle-outline" size={14} color={toneColor} />
            <Text style={[typography.caption, { color: toneColor, fontWeight: "700" }]}>
              Confirm AI Consent
            </Text>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Configure GitHub repositories"
          onPress={() => router.push("/(auth)/repos")}
          style={({ pressed }) => ({
            minHeight: 34,
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: radius.sm,
            backgroundColor: colors.surfaceElevated,
            borderWidth: 1,
            borderColor: colors.border,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Icon name="folder-open-outline" size={14} color={colors.statusInfo} />
          <Text style={[typography.caption, { color: colors.text, fontWeight: "600" }]}>
            Manage GitHub Access
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
