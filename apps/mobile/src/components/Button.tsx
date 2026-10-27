import React, {useRef,useState} from "react";
import { TouchableOpacity, ActivityIndicator, StyleSheet, ViewStyle, TextStyle } from "react-native";
import { Text } from "./Text";
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
  accessibilityLabel?: string;
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
  accessibilityLabel,
}: ButtonProps) {
  const lock=useRef(false);
  const [pending,setPending]=useState(false);
  const invoke=async()=>{if(lock.current || disabled || loading)return;lock.current=true;setPending(true);try{await onPress();}finally{lock.current=false;setPending(false);}};
  const { colors, typography, radius } = useTheme();

  let bg = colors.brand;
  let text = "#FFFFFF";
  let border = "transparent";

  if (variant === "secondary") {
    bg = colors.surfaceInteractive;
    text = colors.text;
    border = colors.border;
  } else if (variant === "destructive") {
    bg = "#B91C1C";
    text = "#FFFFFF";
  } else if (variant === "ghost") {
    bg = "transparent";
    text = colors.brandLight;
  }

  return (
    <TouchableOpacity
      onPress={invoke}
      disabled={disabled || loading || pending}
      activeOpacity={0.8}
      style={[
        styles.btn,
        {
          backgroundColor: bg,
          borderColor: border,
          borderWidth: variant === "secondary" ? 1 : 0,
          borderRadius: radius.md,
          opacity: disabled ? 0.55 : 1,
        },
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      accessibilityState={{ disabled: disabled || loading || pending, busy: loading || pending }}
    >
      {loading || pending ? (
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
    minWidth: 44,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
});
