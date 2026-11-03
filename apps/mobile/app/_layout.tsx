import {OfflineBanner} from "../src/components/OfflineBanner";
import {usePushLinks} from "../src/push/usePushLinks";
import {useReducedMotion} from "../src/hooks/useReducedMotion";
import {ReadoutProvider} from "../src/readout/ReadoutContext";
import {LoadingState} from "../src/components/LoadingState";
import React, { useEffect, useRef } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { View, StyleSheet, Platform, useWindowDimensions } from "react-native";
import { ThemeProvider, useTheme } from "../src/context/ThemeContext";
import { AuthProvider, useAuth } from "../src/context/AuthContext";
import { ConsentProvider } from "../src/context/ConsentContext";
import { AlertsProvider } from "../src/context/AlertsContext";
import { DemoBanner } from "../src/components/DemoBanner";
import { ConfigErrorScreen, SampleDataBanner, isApiMisconfigured } from "../src/components/ConfigBanner";
import { AppFonts } from "../src/components/AppFonts";
import { Sidebar } from "../src/components/Sidebar";
import { SIDEBAR_WIDTH, resolveShell, requiresSession } from "../src/layout/breakpoints";
import { resolveHardwareBackAction, useAndroidBackHandler } from "../src/platform/android";
import { registerServiceWorker } from "../src/platform/serviceWorker";

function AppContent() {
  const reducedMotion=useReducedMotion();
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const { user, session, isLoading } = useAuth();
  usePushLinks(!isLoading && session && !session.demo ? user?.id : undefined);
  const { width } = useWindowDimensions();
  const segments = useSegments() as string[];

  // Web release builds: the service worker serves the offline page and receives Web Push. Never prompts.
  useEffect(() => {
    if (Platform.OS === "web" && !__DEV__) void registerServiceWorker();
  }, []);

  // Android hardware Back / gesture back from secondary tabs returns to Inbox before exiting the app.
  useAndroidBackHandler(() => {
    const action = resolveHardwareBackAction({
      segments,
      canGoBackInStack: typeof router.canGoBack === "function" ? router.canGoBack() : false,
    });
    if (action === "go-inbox") {
      router.replace("/(tabs)/inbox");
      return true;
    }
    return false;
  });

  // Web only: phone column, centered tablet column, or sidebar + wide column on desktop. Native is untouched.
  const shell = resolveShell({ width, segments, signedIn: Boolean(session), isWeb: Platform.OS === "web" });
  const isPhoneFrame = shell.mode === "phone" && Platform.OS === "web";

  // If the session ends while the app is open (expired, revoked), go back to sign-in. Also covers
  // reaching a signed-in screen without a session: browser Back after sign-out, or a pasted URL.
  const hadSession = useRef(false);
  const onProtected = requiresSession(segments);
  const navigatorIdentity=useRef("initial");
  if(onProtected)navigatorIdentity.current=user?.id??"signed-out";
  useEffect(()=>{
    if(!isLoading && session && user?.deletionPending && onProtected && segments.join('/')!=='account/delete')router.replace('/account/delete');
  },[isLoading,session,user?.deletionPending,onProtected,segments,router]);

  useEffect(() => {
    if (session) {
      hadSession.current = true;
    } else if (!isLoading && (hadSession.current || onProtected)) {
      hadSession.current = false;
      router.replace("/(auth)/sign-in");
    }
  }, [session, isLoading, router, onProtected]);

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
        /* Headings the router focuses on navigation are not controls; no box around them. */
        [tabindex="-1"]:focus-visible {
          outline: none !important;
        }
      `;
    }
  }, [colors.brandLight]);

  // A production build without an API address must fail visibly, never fall back to sample data.
  if (isApiMisconfigured) return <ConfigErrorScreen />;

  // Phone and native keep the banners inside the frame, as before. Wider web layouts show them above the column.
  const bannersAbove = Platform.OS === "web" && !isPhoneFrame;
  const banners = (
    <>
      <OfflineBanner />
      <SampleDataBanner />
      <DemoBanner />
    </>
  );

  // The gutter beside the column only shows when the column is narrower than the space it sits in.
  const available = width - (shell.sidebar ? SIDEBAR_WIDTH : 0);
  const hasGutter = shell.kind === "public" && shell.columnMaxWidth !== undefined && !isPhoneFrame && available > shell.columnMaxWidth;

  const privatePending=(!session || (user?.deletionPending && segments.join('/')!=='account/delete')) && onProtected;
  const stack = (
    <View style={{flex:1}}><View style={{flex:1,display:privatePending?"none":"flex"}}>
    <Stack key={navigatorIdentity.current}
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: reducedMotion ? "none" : "slide_from_right",
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
    </Stack></View>{privatePending && <LoadingState title="Checking your session..." message="Verifying access before showing private reviews."/>}</View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <SafeAreaView
        style={[styles.safeArea, shell.sidebar && styles.safeAreaRow, { backgroundColor: colors.background }]}
        edges={["top", "left", "right"]}
      >
        {shell.sidebar && <Sidebar />}
        <View style={styles.main}>
          {bannersAbove && banners}
          <View style={[styles.mainInner, shell.card && styles.mainCard]}>
            <View
              style={[
                styles.webFrame,
                { backgroundColor: colors.background },
                shell.columnMaxWidth !== undefined && { maxWidth: shell.columnMaxWidth },
                shell.sidebar && { alignSelf: "stretch" },
                hasGutter && !shell.card && { borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.border },
                shell.card && {
                  ...styles.authCard,
                  borderColor: colors.border,
                  backgroundColor: colors.background,
                },
              ]}
            >
              {!bannersAbove && banners}
              {stack}
            </View>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

export default function RootLayout() {
  return (
    <AppFonts>
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <ConsentProvider>
            <AlertsProvider>
              <ReadoutProvider><AppContent /></ReadoutProvider>
            </AlertsProvider>
          </ConsentProvider>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
    </AppFonts>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  safeAreaRow: {
    flexDirection: "row",
  },
  main: {
    flex: 1,
  },
  mainInner: {
    flex: 1,
  },
  mainCard: {
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  webFrame: {
    flex: 1,
    width: "100%",
    alignSelf: "center",
  },
  authCard: {
    maxHeight: 760,
    borderWidth: 1,
    borderRadius: 16,
    overflow: "hidden",
  },
});
