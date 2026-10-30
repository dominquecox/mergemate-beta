import React from "react";
import { Stack } from "expo-router";
import { useTheme } from "../../src/context/ThemeContext";

export default function AuthLayout() {
  const { colors } = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: "slide_from_right" }}>
      <Stack.Screen name="welcome" />
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="consent" />
      <Stack.Screen name="repos" />
    </Stack>
  );
}
