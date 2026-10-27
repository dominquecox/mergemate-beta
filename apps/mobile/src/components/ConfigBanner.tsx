import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { apiMode } from "../api";
import { useTheme } from "../context/ThemeContext";

/**
 * Says so when the app is not talking to the real API:
 *  - development build with no EXPO_PUBLIC_API_BASE_URL: a small "Sample data" banner above the app;
 *  - any build with a missing or invalid address in production: a full-screen message instead of the app.
 */
export function SampleDataBanner() {
  const { colors, typography, spacing } = useTheme();
  if (apiMode.kind !== "mock") return null;

  return (
    <View
      style={[styles.banner, { backgroundColor: colors.demoBadgeBg, borderColor: colors.demoBadge, paddingVertical: spacing.xs }]}
      accessibilityRole="alert"
      accessibilityLabel="Sample data. This build is not connected to the MergeMate API."
    >
      <Text style={[typography.caption, { color: colors.demoBadge, fontWeight: "700" }]}>
        SAMPLE DATA · not connected to the API
      </Text>
    </View>
  );
}

export function ConfigErrorScreen() {
  const { colors, typography, spacing } = useTheme();
  const reason = apiMode.kind === "error" ? apiMode.reason : "missing";
  return (
    <View style={[styles.full, { backgroundColor: colors.background, padding: spacing.xl }]} accessibilityRole="alert">
      <Text style={[typography.title2, { color: colors.text, textAlign: "center" }]}>MergeMate can't start</Text>
      <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.sm, textAlign: "center" }]}>
        {reason === "invalid"
          ? "This build has an API address that isn't valid. Install the latest version of the app."
          : "This build isn't connected to MergeMate's servers. Install the latest version of the app."}
      </Text>
    </View>
  );
}

/** True when the app must not run at all because it has no usable API address. */
export const isApiMisconfigured = apiMode.kind === "error";

const styles = StyleSheet.create({
  banner: {
    alignItems: "center",
    borderBottomWidth: 1,
  },
  full: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
