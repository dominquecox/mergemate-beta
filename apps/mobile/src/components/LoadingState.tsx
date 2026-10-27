import React from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { Text } from "./Text";
import { useTheme } from "../context/ThemeContext";

interface LoadingStateProps {
  title?: string;
  message?: string;
}

export function LoadingState({
  title = "Loading...",
  message = "Please wait a moment while we fetch the latest data.",
}: LoadingStateProps) {
  const { colors, typography, spacing } = useTheme();

  return (
    <View
      style={[styles.container, { padding: spacing.xl }]}
      accessibilityRole="progressbar"
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${title}. ${message}`}
    >
      <View style={{width:"100%",maxWidth:480,gap:12,marginBottom:24}}>{[100,80,92].map((width,index)=><View key={index} style={{height:index===0?100:18,width:`${width}%`,backgroundColor:colors.surfaceElevated,borderRadius:12}}/>)}</View>
      <ActivityIndicator size="small" color={colors.brandLight} />
      <Text style={[typography.headline, { color: colors.text, marginTop: spacing.md, textAlign: "center" }]}>
        {title}
      </Text>
      <Text
        style={[
          typography.body,
          { color: colors.textSecondary, marginTop: spacing.xs, textAlign: "center", maxWidth: 300 },
        ]}
      >
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 220,
  },
});
