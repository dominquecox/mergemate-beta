import React, { useEffect, useState } from "react";
import { View, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../src/context/AuthContext";
import { useTheme } from "../src/context/ThemeContext";
import { LoadingState } from "../src/components/LoadingState";
import { ErrorState } from "../src/components/ErrorState";
import { EmptyState } from "../src/components/EmptyState";

export default function IndexScreen() {
  const router = useRouter();
  const { session, isLoading, error, clearError } = useAuth();
  const { colors } = useTheme();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!isLoading && !error) {
      if (session) {
        router.replace("/(tabs)/inbox");
      } else {
        router.replace("/(auth)/welcome");
      }
    }
  }, [session, isLoading, error, router]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {error ? (
        <ErrorState
          title="Could not start MergeMate"
          message={error}
          onRetry={() => {
            clearError();
            setTimedOut(false);
            router.replace("/(auth)/welcome");
          }}
        />
      ) : timedOut ? (
        <EmptyState
          icon="rocket-outline"
          title="Ready to get started"
          message="Continue to sign in or explore MergeMate in demo mode."
          actionTitle="Continue"
          onAction={() => router.replace("/(auth)/welcome")}
        />
      ) : (
        <LoadingState
          title="Starting MergeMate..."
          message="Checking your sign-in status and preferences."
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
