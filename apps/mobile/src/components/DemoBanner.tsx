import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

export function DemoBanner() {
  const { isDemo, signOut } = useAuth();
  const { colors, typography, spacing, radius } = useTheme();

  if (!isDemo) return null;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.demoBadgeBg,
          borderColor: colors.demoBadge,
          paddingHorizontal: spacing.base,
          paddingVertical: spacing.sm,
        },
      ]}
      accessibilityRole="alert"
      accessibilityLabel="Demo mode active with seeded sample data"
    >
      <View style={styles.content}>
        <View style={[styles.dot, { backgroundColor: colors.demoBadge }]} />
        <Text style={[typography.footnote, { color: colors.demoBadge, fontWeight: "600" }]}>
          DEMO MODE · Seeded Data Only
        </Text>
      </View>
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
    borderBottomWidth: 1,
    zIndex: 999,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  exitBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
  },
});
