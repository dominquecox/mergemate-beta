import React from "react";
import { View, TouchableOpacity, Image, StyleSheet } from "react-native";
import { Text } from "./Text";
import { useRouter } from "expo-router";
import { useTheme } from "../context/ThemeContext";
import { useLayout } from "../layout/useLayout";
import { Platform } from "react-native";
import { Icon } from "./Icon";

interface HeaderProps {
  title?: string;
  showBack?: boolean;
  showLogo?: boolean;
  rightAction?: React.ReactNode;
}

export function Header({ title, showBack = false, showLogo = false, rightAction }: HeaderProps) {
  const router = useRouter();
  const {isDesktop}=useLayout();
  const { colors, typography, isDark } = useTheme();

  return (
    <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
      <View style={[styles.left,isDesktop && !showBack && {minWidth:0}]}>
        {showBack && (
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <View style={styles.backContent}>
              <Icon name="chevron-back" size={22} color={colors.brandLight} />
              <Text style={[typography.headline, { color: colors.brandLight }]}>Back</Text>
            </View>
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
            accessibilityRole="image"
            accessibilityLabel="MergeMate"
          />
        )}
      </View>

      {title && !showLogo && (
        <Text
          style={[typography.headline, { color: colors.text, textAlign: isDesktop ? "left" : "center", flex: 1 }]}
          numberOfLines={1}
          accessibilityRole="header"
        >
          {title}
        </Text>
      )}

      <View style={styles.right}>{rightAction}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 56,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    minWidth: 64,
  },
  backBtn: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 4,
    justifyContent: "center",
  },
  backContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  logo: {
    width: 142,
    height: 34,
  },
  right: {
    minWidth: 64,
    alignItems: "flex-end",
    justifyContent: "center",
  },
});
