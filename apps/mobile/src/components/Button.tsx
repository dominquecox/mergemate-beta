import React from "react";
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet, ViewStyle, TextStyle } from "react-native";
import { useTheme } from "../context/ThemeContext";

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "destructive" | "ghost";
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: React.ReactNode;
}

export function Button({
  title,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
  style,
  textStyle,
  icon,
}: ButtonProps) {
  const { colors, typography, radius } = useTheme();

  let bg = colors.brand;
  let text = "#FFFFFF";
  let border = "transparent";

  if (variant === "secondary") {
    bg = colors.surfaceInteractive;
    text = colors.text;
    border = colors.border;
  } else if (variant === "destructive") {
    bg = colors.riskHigh;
    text = "#FFFFFF";
  } else if (variant === "ghost") {
    bg = "transparent";
    text = colors.brandLight;
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      style={[
        styles.btn,
        {
          backgroundColor: bg,
          borderColor: border,
          borderWidth: variant === "secondary" ? 1 : 0,
          borderRadius: radius.md,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: disabled || loading }}
    >
      {loading ? (
        <ActivityIndicator color={text} size="small" />
      ) : (
        <>
          {icon}
          <Text style={[typography.headline, { color: text, fontWeight: "600" }, textStyle]}>
            {title}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
});
