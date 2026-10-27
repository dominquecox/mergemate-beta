import React from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { View, StyleSheet, Platform } from "react-native";
import { ThemeProvider, useTheme } from "../src/context/ThemeContext";
import { AuthProvider } from "../src/context/AuthContext";
import { ConsentProvider } from "../src/context/ConsentContext";
import { DemoBanner } from "../src/components/DemoBanner";

function AppContent() {
  const { colors, isDark } = useTheme();

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={["top", "left", "right"]}>
        <View style={[styles.webFrame, { backgroundColor: colors.background }]}>
          <DemoBanner />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.background },
              animation: "slide_from_right",
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="pr/[owner]/[repo]/[number]" options={{ headerShown: false }} />
            <Stack.Screen name="highlight" options={{ headerShown: false }} />
            <Stack.Screen name="search" options={{ headerShown: false }} />
            <Stack.Screen name="account/delete" options={{ presentation: "modal", headerShown: false }} />
            <Stack.Screen name="billing" options={{ headerShown: false }} />
            <Stack.Screen name="(public)" options={{ headerShown: false }} />
          </Stack>
        </View>
      </SafeAreaView>
    </View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <ConsentProvider>
            <AppContent />
          </ConsentProvider>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  webFrame: {
    flex: 1,
    width: "100%",
    maxWidth: Platform.OS === "web" ? 540 : undefined,
    alignSelf: "center",
    ...Platform.select({
      web: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
    }),
  },
});
