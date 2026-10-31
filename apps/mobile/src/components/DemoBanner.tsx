import React from "react";
import { View, TouchableOpacity, StyleSheet } from "react-native";
import { Text } from "./Text";
import { useRouter } from "expo-router";
import { DEMO_TOUR_PATH } from "../workspace/tour";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

export function DemoBanner() {
  const { isDemo, signOut } = useAuth();
  const { colors, typography, spacing, radius } = useTheme();
  const router = useRouter();

  if (!isDemo) return null;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.demoBadgeBg,
          borderColor: colors.demoBadge,
          paddingHorizontal: spacing.base,
          paddingVertical: spacing.xs,
        },
      ]}
      accessibilityRole="alert"
      accessibilityLabel="Demo mode active with sample data only"
    >
      <View style={styles.content}>
        <View style={[styles.dot, { backgroundColor: colors.demoBadge }]} />
        <Text style={[typography.footnote, { color: colors.demoBadge, fontWeight: "600" }]}>
          DEMO MODE · Sample Data Only
        </Text>
      </View>
      <TouchableOpacity
        onPress={() => router.push(DEMO_TOUR_PATH as never)}
        style={[styles.exitBtn, { borderColor: colors.demoBadge, borderRadius: radius.sm }]}
        accessibilityRole="button"
        accessibilityLabel="Start the guided tour"
      >
        <Text style={[typography.caption, { color: colors.demoBadge, fontWeight: "700" }]}>
          Tour
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={signOut}
        style={[styles.exitBtn, { borderColor: colors.demoBadge, borderRadius: radius.sm }]}
        accessibilityRole="button"
        accessibilityLabel="Exit demo mode"
      >
        <Text style={[typography.caption, { color: colors.demoBadge, fontWeight: "700" }]}>
          Exit Demo
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
    borderBottomWidth: 1,
    minHeight: 48,
    zIndex: 999,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 1,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  exitBtn: {
    minHeight: 44,
    minWidth: 76,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
});
