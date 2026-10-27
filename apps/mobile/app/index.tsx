import React, { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../src/context/AuthContext";
import { useTheme } from "../src/context/ThemeContext";

export default function IndexScreen() {
  const router = useRouter();
  const { session, isLoading } = useAuth();
  const { colors } = useTheme();

  useEffect(() => {
    if (!isLoading) {
      if (session) {
        router.replace("/(tabs)/inbox");
      } else {
        router.replace("/(auth)/welcome");
      }
    }
  }, [session, isLoading, router]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.brandLight} />
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
