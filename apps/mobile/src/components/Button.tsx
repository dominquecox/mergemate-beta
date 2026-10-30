import React, {useRef,useState} from "react";
import { Pressable, ActivityIndicator, StyleSheet, ViewStyle, TextStyle } from "react-native";
import { Text } from "./Text";
import { useTheme } from "../context/ThemeContext";
import { androidRipple, MIN_TOUCH_TARGET_DP } from "../platform/android";

interface ButtonProps {
  title: string;
  onPress: () => void | Promise<void>;
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
    <Pressable
      onPress={invoke}
      disabled={disabled || loading || pending}
      android_ripple={androidRipple("rgba(255, 255, 255, 0.18)")}
      style={({ pressed }) => [
        styles.btn,
        {
          backgroundColor: bg,
          borderColor: border,
          borderWidth: variant === "secondary" ? 1 : 0,
          borderRadius: radius.sm,
          opacity: disabled ? 0.55 : pressed ? 0.85 : 1,
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
          <Text style={[typography.subhead, { color: text }, textStyle]}>
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    minHeight: MIN_TOUCH_TARGET_DP,
    minWidth: MIN_TOUCH_TARGET_DP,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    overflow: "hidden",
  },
});
