import React from "react";
import { Platform } from "react-native";
import { Redirect, Stack } from "expo-router";

/**
 * Compliance Gate:
 * Billing, pricing comparison, and Stripe checkout routes are strictly web-only.
 * On native iOS/Android, all /billing routes unconditionally redirect to Settings.
 * No prices or purchase UI can ever render in the native app.
 */
export default function BillingLayout() {
  if (Platform.OS !== "web") {
    return <Redirect href="/(tabs)/settings" />;
  }
  return <Stack screenOptions={{ headerShown: false }} />;
}
