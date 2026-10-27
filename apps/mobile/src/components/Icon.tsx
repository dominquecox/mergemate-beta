import React from "react";
import { Ionicons } from "@expo/vector-icons";

export type IconName = React.ComponentProps<typeof Ionicons>["name"];

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  style?: React.ComponentProps<typeof Ionicons>["style"];
  /** Only set for an icon that stands alone. Icons next to text are decorative and hidden from screen readers. */
  label?: string;
}

export function Icon({ name, size = 18, color, style, label }: IconProps) {
  // lineHeight = size keeps the glyph box tight so icons do not push neighbouring text around.
  const merged = { lineHeight: size, ...(style as object) };
  if (label) {
    return <Ionicons name={name} size={size} color={color} style={merged} accessibilityRole="image" accessibilityLabel={label} />;
  }
  return <Ionicons name={name} size={size} color={color} style={merged} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />;
}
