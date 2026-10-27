import React, { useEffect, useRef } from "react";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { View, StyleSheet, Platform } from "react-native";
import { ThemeProvider, useTheme } from "../src/context/ThemeContext";
import { AuthProvider, useAuth } from "../src/context/AuthContext";
import { ConsentProvider } from "../src/context/ConsentContext";
import { DemoBanner } from "../src/components/DemoBanner";
import { ConfigErrorScreen, SampleDataBanner, isApiMisconfigured } from "../src/components/ConfigBanner";

function AppContent() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const { session, isLoading } = useAuth();

  // If the session ends while the app is open (expired, revoked), go back to sign-in.
  const hadSession = useRef(false);
  useEffect(() => {
    if (session) {
      hadSession.current = true;
    } else if (hadSession.current && !isLoading) {
      hadSession.current = false;
      router.replace("/(auth)/sign-in");
    }
  }, [session, isLoading, router]);

  useEffect(() => {
    if (Platform.OS === "web" && typeof document !== "undefined") {
      const id = "mergemate-a11y-focus-style";
      let styleEl = document.getElementById(id) as HTMLStyleElement | null;
      if (!styleEl) {
        styleEl = document.createElement("style");
        styleEl.id = id;
        document.head.appendChild(styleEl);
      }
      styleEl.textContent = `
        *:focus-visible {
          outline: 2px solid ${colors.brandLight} !important;
          outline-offset: 2px !important;
        }
      `;
    }
  }, [colors.brandLight]);

  // A production build without an API address must fail visibly, never fall back to sample data.
  if (isApiMisconfigured) return <ConfigErrorScreen />;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={["top", "left", "right"]}>
        <View style={[styles.webFrame, { backgroundColor: colors.background }]}>
          <SampleDataBanner />
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
            <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
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
