import {NativeAuthRelay} from "../../src/components/NativeAuthRelay";
import {nativeAuthReturn} from "../../src/auth/github-return";
import {StorageService} from "../../src/storage";
import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, Platform } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "../../src/context/AuthContext";
import { useTheme } from "../../src/context/ThemeContext";
import { api } from "../../src/api";
import { EmptyState } from "../../src/components/EmptyState";
import { ErrorState } from "../../src/components/ErrorState";
import { LoadingState } from "../../src/components/LoadingState";
import { validOAuthParams } from "../../src/navigation/links";

/**
 * GitHub sends the person back here with `code` and `state` (or `error` if they said no).
 * Web exchanges in its initiating tab. Native uses a browser-session scheme return
 * or a verified HTTPS App Link; the browser relay never exchanges the native code.
 * The code is posted once with the stored PKCE verifier, then this route is replaced.
 */
export default function AuthCallbackScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { completeGithubSignIn, setError, session, isLoading } = useAuth();
  const params = useLocalSearchParams<{ code?: string | string[]; state?: string | string[]; error?: string | string[]; native?:string|string[] }>();
  const started = useRef(false);
  const relay=useRef<string|null>(null);
  const stateParam = typeof params.state === 'string' ? params.state : undefined;
  const isNative = params.native === '1' || (stateParam !== undefined && stateParam.startsWith('n_'));
  if(Platform.OS==='web'&&isNative&&!relay.current)relay.current=nativeAuthReturn(params);
  const [localError, setLocalError] = useState<string | null>(null);
  const [missingParams, setMissingParams] = useState(false);

  useEffect(() => {
    if (started.current) return;
    // A remount after URL scrubbing must let the active session settle first.
    if(!params.code&&!params.error&&!relay.current&&isLoading)return;
    started.current = true;

    const code = typeof params.code === "string" ? params.code : undefined;
    const state = typeof params.state === "string" ? params.state : undefined;
    const errorParam = typeof params.error === "string" ? params.error : undefined;
    // Capture once, then remove transient OAuth values from browser history immediately.
    if(Platform.OS==="web" && typeof window!=="undefined")window.history.replaceState(window.history.state,"",window.location.pathname);

    const run = async () => {
      if(relay.current)return;
      if(!code&&!state&&!errorParam&&session&&!(await StorageService.hasPendingSignIn().catch(()=>true))){router.replace('/(tabs)/inbox');return;}

      if (errorParam) {
        if(state)await StorageService.takePendingSignIn(Date.now(),state).catch(()=>null);
        setError("Sign-in was cancelled.");
        setLocalError("Sign-in was cancelled.");
        router.replace("/(auth)/sign-in");
        return;
      }
      if (!validOAuthParams(params) || !code || !state) {
        if(state)await StorageService.takePendingSignIn(Date.now(),state).catch(()=>null);
        setError("That sign-in link isn't valid. Start again.");
        setMissingParams(true);
        router.replace("/(auth)/sign-in");
        return;
      }
      const ok = await completeGithubSignIn(code, state);
      if (!ok) {
        setLocalError("Could not complete GitHub sign-in. Please try again.");
        router.replace("/(auth)/sign-in");
        return;
      }
      // First time here, or nothing installed yet: go choose repositories. Otherwise the inbox.
      try {
        const { items } = await api.getOrgInstallations();
        router.replace(items.some((i) => i.status === "active") ? "/(tabs)/inbox" : "/(auth)/repos");
      } catch {
        router.replace("/(tabs)/inbox");
      }
    };
    void run();
  }, [params.code, params.state, params.error, completeGithubSignIn, setError, router, isLoading, session, params.native]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {relay.current ? <NativeAuthRelay url={relay.current}/> : localError ? (
        <ErrorState
          title="Could not finish sign-in"
          message={localError}
          onRetry={() => router.replace("/(auth)/sign-in")}
          retryLabel="Back to Sign In"
        />
      ) : missingParams ? (
        <EmptyState
          icon="key-outline"
          title="Sign-in link expired"
          message="Start a new sign-in from the MergeMate sign-in screen."
          actionTitle="Go to Sign In"
          onAction={() => router.replace("/(auth)/sign-in")}
        />
      ) : (
        <LoadingState
          title="Finishing sign-in..."
          message="Verifying your GitHub authorization and loading your inbox."
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
