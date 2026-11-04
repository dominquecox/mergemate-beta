import React, { type ReactNode } from "react";
import { Pressable, type AccessibilityRole, type StyleProp, type ViewStyle, View } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { controlDensity } from "../theme";

type CompactControlVariant = "secondary" | "chip" | "icon" | "segment";

interface CompactControlProps {
  children: ReactNode;
  onPress: () => void;
  isDesktop: boolean;
  variant?: CompactControlVariant;
  selected?: boolean;
  accessibilityRole?: AccessibilityRole;
  accessibilityLabel: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}

/** A compact visual control inside a mandatory 44px interaction target. */
export function CompactControl({
  children,
  onPress,
  isDesktop,
  variant = "secondary",
  selected = false,
  accessibilityRole = "button",
  accessibilityLabel,
  disabled = false,
  style,
  contentStyle,
}: CompactControlProps) {
  const { colors, radius } = useTheme();
  const density = controlDensity[isDesktop ? "desktop" : "narrow"];
  const metric = variant === "icon" ? density.icon : variant === "chip" ? density.chip : density.secondary;
  const isSegment = variant === "segment";

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityRole === "tab" || accessibilityRole === "radio" ? { disabled, selected } : accessibilityRole === "switch" || accessibilityRole === "checkbox" ? { disabled, checked: !!selected } : { disabled }}
      style={({ pressed }) => [
        {
          minHeight: metric.hitHeight,
          minWidth: metric.hitHeight,
          alignItems: "center",
          justifyContent: "center",
          opacity: disabled ? 0.5 : pressed ? 0.82 : 1,
        },
        style,
      ]}
    >
      <View
        pointerEvents="none"
        style={[
          {
            height: metric.visualHeight,
            minWidth: variant === "icon" ? metric.visualHeight : undefined,
            paddingHorizontal: metric.paddingHorizontal,
            borderRadius: variant === "chip" ? radius.full : radius.sm,
            borderWidth: isSegment || variant === "secondary" ? 0 : 1,
            borderColor: selected ? colors.brandMuted : colors.border,
            backgroundColor: selected ? colors.brandSubtle : isSegment || variant === "secondary" ? "transparent" : colors.surface,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 5,
          },
          contentStyle,
        ]}
      >
        {children}
      </View>
    </Pressable>
  );
}
