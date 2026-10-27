import React, { useEffect } from "react";
import { View, Platform, Linking } from "react-native";
import { Text } from "./Text";
import { Button } from "./Button";
import { Header } from "./Header";
import { useTheme } from "../context/ThemeContext";

/** The only copy of MergeMate's legal pages lives on mergemate.dev; the app never keeps its own. */
export const SITE_ORIGIN = "https://mergemate.dev";

export type LegalSlug = "terms" | "privacy" | "delete-account";

export const LEGAL_URLS: Record<LegalSlug, string> = {
  terms: `${SITE_ORIGIN}/terms`,
  privacy: `${SITE_ORIGIN}/privacy`,
  "delete-account": `${SITE_ORIGIN}/delete-account`,
};

/** On web, replaces this page with the official one. On iOS, offers to open it in the browser. */
export function LegalPage({ slug, title }: { slug: LegalSlug; title: string }) {
  const { colors, typography, spacing } = useTheme();
  const url = LEGAL_URLS[slug];
  useEffect(() => {
    if (Platform.OS === "web" && typeof window !== "undefined") window.location.replace(url);
  }, [url]);
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Header title={title} showBack />
      <View style={{ padding: spacing.xl, gap: spacing.base }}>
        <Text style={[typography.body, { color: colors.textSecondary }]}>
          The official {title} for MergeMate by Ploonu LLC is published at {url.replace("https://", "")}.
        </Text>
        <Button title={`Open ${title}`} onPress={() => Linking.openURL(url)} variant="secondary" />
      </View>
    </View>
  );
}
