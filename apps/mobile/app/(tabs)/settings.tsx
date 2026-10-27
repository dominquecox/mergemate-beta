import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, Switch, StyleSheet, Platform, Linking, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "../../src/context/ThemeContext";
import { useAuth } from "../../src/context/AuthContext";
import { useConsent } from "../../src/context/ConsentContext";
import { api } from "../../src/api";
import { BillingPlan, UserSettings } from "../../src/types";
import { Header } from "../../src/components/Header";
import { Button } from "../../src/components/Button";

export default function SettingsScreen() {
  const router = useRouter();
  const { colors, typography, spacing, radius, themeMode, setThemeMode } = useTheme();
  const { user, signOut, isDemo } = useAuth();
  const { aiConsentGranted, grantConsent, revokeConsent } = useConsent();

  const [settings, setSettings] = useState<UserSettings>({
    notificationsEnabled: true,
    quietHours: { enabled: true, start: "22:00", end: "08:00" },
    aiSummariesEnabled: aiConsentGranted,
    theme: themeMode,
    emailAlerts: false,
  });

  const [billing, setBilling] = useState<BillingPlan>({
    plan: "free",
    status: "active",
  });

  useEffect(() => {
    api.getSettings().then(setSettings).catch(() => {});
    api.getBillingPlan().then(setBilling).catch(() => {});
  }, []);

  const toggleAi = async (val: boolean) => {
    if (val) {
      await grantConsent();
    } else {
      await revokeConsent();
    }
    setSettings((prev) => ({ ...prev, aiSummariesEnabled: val }));
  };

  const handleManagePlan = () => {
    if (Platform.OS === "web") {
      router.push("/billing");
    } else {
      // iPhone storefront compliant linking out
      Linking.openURL("https://mergemate.dev/billing");
    }
  };

  const handleSignOut = () => {
    if (Platform.OS === "web") {
      signOut();
      router.replace("/(auth)/sign-in");
    } else {
      Alert.alert("Sign Out", "Are you sure you want to sign out?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out",
          style: "destructive",
          onPress: async () => {
            await signOut();
            router.replace("/(auth)/sign-in");
          },
        },
      ]);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Header title="Settings" />
      <ScrollView contentContainerStyle={{ padding: spacing.base, paddingBottom: 60 }}>
        {/* Account Profile Card */}
        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg }]}>
          <View style={styles.userRow}>
            <View style={[styles.avatar, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
              <Text style={{ fontSize: 24 }}>👤</Text>
            </View>
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text style={[typography.headline, { color: colors.text }]}>
                {user?.name || user?.login || "Demo User"}
              </Text>
              <Text style={[typography.footnote, { color: colors.textSecondary }]}>
                @{user?.login || "demo-developer"}
              </Text>
              {isDemo && (
                <View style={[styles.demoTag, { backgroundColor: colors.demoBadgeBg, marginTop: 4 }]}>
                  <Text style={[typography.caption, { color: colors.demoBadge, fontWeight: "700" }]}>
                    DEMO ACCOUNT
                  </Text>
                </View>
              )}
            </View>
          </View>

          <Button
            title="Sign Out"
            onPress={handleSignOut}
            variant="secondary"
            style={{ marginTop: spacing.md }}
          />
        </View>

        {/* Subscription Plan (US-20, US-21) */}
        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, marginTop: spacing.base }]}>
          <Text style={[typography.subhead, { color: colors.textMuted, textTransform: "uppercase" }]}>
            Plan & Usage
          </Text>
          <View style={styles.planHeader}>
            <View>
              <Text style={[typography.title2, { color: colors.text, textTransform: "capitalize" }]}>
                {billing.plan} Plan
              </Text>
              <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>
                {billing.plan === "pro"
                  ? "More AI summaries and risk checks every day · Manage plan anytime"
                  : "AI summaries, triage deck, and secret alerts"}
              </Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: colors.brandSubtle }]}>
              <Text style={[typography.caption, { color: colors.brandLight, fontWeight: "700" }]}>ACTIVE</Text>
            </View>
          </View>

          {/* Manage Plan Link (Compliance: iPhone shows plan status + link only, no prices or in-app purchase) */}
          <Button
            title={Platform.OS === "web" ? "Manage Billing & Plans" : "Manage Plan"}
            onPress={handleManagePlan}
            variant="secondary"
            style={{ marginTop: spacing.md }}
          />
        </View>

        {/* AI & Privacy (US-05) */}
        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, marginTop: spacing.base }]}>
          <Text style={[typography.subhead, { color: colors.textMuted, textTransform: "uppercase" }]}>
            AI & Processing
          </Text>
          <View style={styles.row}>
            <View style={{ flex: 1, paddingRight: spacing.md }}>
              <Text style={[typography.headline, { color: colors.text }]}>AI Summaries & Risk Scoring</Text>
              <Text style={[typography.footnote, { color: colors.textSecondary, marginTop: 2 }]}>
                Send filtered patch diffs to Meta AI models for automated code review summaries.
              </Text>
            </View>
            <Switch
              value={aiConsentGranted}
              onValueChange={toggleAi}
              trackColor={{ false: colors.surfaceSecondary, true: colors.brand }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* Notifications & Quiet Hours (US-17) */}
        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, marginTop: spacing.base }]}>
          <Text style={[typography.subhead, { color: colors.textMuted, textTransform: "uppercase" }]}>
            Notifications
          </Text>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[typography.headline, { color: colors.text }]}>Quiet Hours</Text>
              <Text style={[typography.footnote, { color: colors.textSecondary, marginTop: 2 }]}>
                Silence review notifications from 22:00 to 08:00.
              </Text>
            </View>
            <Switch
              value={settings.quietHours.enabled}
              onValueChange={(val) =>
                setSettings((prev) => ({ ...prev, quietHours: { ...prev.quietHours, enabled: val } }))
              }
              trackColor={{ false: colors.surfaceSecondary, true: colors.brand }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* Appearance */}
        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, marginTop: spacing.base }]}>
          <Text style={[typography.subhead, { color: colors.textMuted, textTransform: "uppercase" }]}>
            Appearance
          </Text>
          <View style={[styles.themeRow, { marginTop: spacing.sm }]}>
            {(["dark", "light", "system"] as const).map((mode) => (
              <TouchableOpacity
                key={mode}
                onPress={() => setThemeMode(mode)}
                style={[
                  styles.themeTab,
                  {
                    backgroundColor: themeMode === mode ? colors.brand : colors.surfaceSecondary,
                    borderRadius: radius.md,
                  },
                ]}
              >
                <Text
                  style={[
                    typography.caption,
                    {
                      color: themeMode === mode ? "#FFFFFF" : colors.textSecondary,
                      fontWeight: "700",
                      textTransform: "capitalize",
                    },
                  ]}
                >
                  {mode}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Legal & Support Links (US-18, US-23) */}
        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, marginTop: spacing.base }]}>
          <Text style={[typography.subhead, { color: colors.textMuted, textTransform: "uppercase", marginBottom: spacing.xs }]}>
            About & Legal
          </Text>

          {[
            { label: "What's New (Changelog)", route: "/(public)/changelog" },
            { label: "Product News", route: "/(public)/news" },
            { label: "Support (support@mergemate.dev)", route: "/(public)/support" },
            { label: "Privacy Policy", route: "/(public)/privacy" },
            { label: "Terms of Service", route: "/(public)/terms" },
          ].map((item, idx) => (
            <TouchableOpacity
              key={idx}
              onPress={() => router.push(item.route as any)}
              style={[styles.linkRow, { borderBottomColor: colors.border, borderBottomWidth: idx === 4 ? 0 : 1 }]}
            >
              <Text style={[typography.body, { color: colors.text }]}>{item.label}</Text>
              <Text style={[typography.headline, { color: colors.textMuted }]}>›</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Account Deletion (US-22) */}
        <View style={{ marginTop: spacing.lg }}>
          <Button
            title="Delete Account & Revoke Access"
            onPress={() => router.push("/account/delete")}
            variant="destructive"
            style={{ width: "100%" }}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  sectionCard: {
    padding: 16,
    borderWidth: 1,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  demoTag: {
    alignSelf: "flex-start",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  planHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },
  themeRow: {
    flexDirection: "row",
    gap: 8,
  },
  themeTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
});
