import React from "react";
import { View, Text, TouchableOpacity, Image, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "../context/ThemeContext";

interface HeaderProps {
  title?: string;
  showBack?: boolean;
  showLogo?: boolean;
  rightAction?: React.ReactNode;
}

export function Header({ title, showBack = false, showLogo = false, rightAction }: HeaderProps) {
  const router = useRouter();
  const { colors, typography, isDark } = useTheme();

  return (
    <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
      <View style={styles.left}>
        {showBack && (
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Text style={[typography.headline, { color: colors.brandLight }]}>‹ Back</Text>
          </TouchableOpacity>
        )}
        {showLogo && (
          <Image
            source={
              isDark
                ? require("../../assets/logo-dark.png")
                : require("../../assets/logo-light.png")
            }
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel="MergeMate Logo"
          />
        )}
      </View>

      {title && !showLogo && (
        <Text style={[typography.headline, { color: colors.text, textAlign: "center" }]} numberOfLines={1}>
          {title}
        </Text>
      )}

      <View style={styles.right}>{rightAction}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 54,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    minWidth: 60,
  },
  backBtn: {
    paddingVertical: 6,
    paddingRight: 10,
  },
  logo: {
    width: 130,
    height: 32,
  },
  right: {
    minWidth: 60,
    alignItems: "flex-end",
  },
});
