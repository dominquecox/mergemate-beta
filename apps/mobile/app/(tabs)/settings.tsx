import React, { useState, useEffect, useCallback } from "react";
import { View, ScrollView, TouchableOpacity, Switch, StyleSheet, Platform, Linking, Alert, TextInput } from "react-native";
import { Text } from "../../src/components/Text";
import { useRouter } from "expo-router";
import { useTheme } from "../../src/context/ThemeContext";
import { useAuth } from "../../src/context/AuthContext";
import { useConsent } from "../../src/context/ConsentContext";
import { api, apiMode } from "../../src/api";
import { webAppOrigin } from "../../src/api/config";
import { toUserMessage } from "../../src/api/errors";
import { StorageService } from "../../src/storage";
import { registerPush, unregisterPush } from "../../src/push/registration";
import { BillingPlan, UserSettings } from "../../src/types";
import { Header } from "../../src/components/Header";
import { Button } from "../../src/components/Button";
import { EmptyState } from "../../src/components/EmptyState";
import { ErrorState } from "../../src/components/ErrorState";
import { LoadingState } from "../../src/components/LoadingState";
import { useLayout } from "../../src/layout/useLayout";
import { Icon } from "../../src/components/Icon";

export default function SettingsScreen() {
  const router = useRouter();
  const {isDesktop}=useLayout();
  const { colors, typography, spacing, radius, themeMode, setThemeMode } = useTheme();
  const { user, signOut, isDemo } = useAuth();
  const { aiConsentGranted, grantConsent, revokeConsent, error: consentError } = useConsent();

  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [billing, setBilling] = useState<BillingPlan>({
    plan: "free",
    status: "active",
  });

  // null means this API does not offer the feature, so the section is left out.
  const [metaKey, setMetaKey] = useState<{ configured: boolean } | null>(null);
  const [metaKeyInput, setMetaKeyInput] = useState("");
  const [metaKeyBusy, setMetaKeyBusy] = useState(false);
  const [pushOn, setPushOn] = useState(false);

  const loadSettingsData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [fetchedSettings, fetchedPlan] = await Promise.all([
        api.getSettings(),
        api.getBillingPlan(),
      ]);
      setSettings(fetchedSettings);
      setBilling(fetchedPlan);
      api.getMetaKeyStatus().then(setMetaKey).catch(() => setMetaKey(null));
      if (Platform.OS !== "web") StorageService.getPushEnabled().then(setPushOn).catch(() => {});
    } catch (e) {
      setLoadError(toUserMessage(e, "Couldn't load your settings."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettingsData();
  }, [loadSettingsData]);

  /** Saves a change to the API. The switch moves at once and snaps back, with the reason, if it is refused. */
  const saveSettings = async (patch: Partial<UserSettings>): Promise<boolean> => {
    if (!settings) return false;
    const before = settings;
    setNotice(null);
    setSettings({ ...before, ...patch, notifications: { ...before.notifications, ...patch.notifications } });
    try {
      setSettings(await api.updateSettings(patch));
      return true;
    } catch (e) {
      setSettings(before);
      setNotice(toUserMessage(e, "Couldn't save that change."));
      return false;
    }
  };

  const toggleAi = async (val: boolean) => {
    setNotice(null);
    if (val) {
      if (await grantConsent()) await saveSettings({ aiSummaries: true });
    } else if (await saveSettings({ aiSummaries: false })) {
      await revokeConsent();
    }
  };

  const toggleQuietHours = async (on: boolean) => {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    await saveSettings({ quietHours: on ? { start: "22:00", end: "08:00", timeZone } : null });
  };

  const togglePush = async (on: boolean) => {
    setNotice(null);
    try {
      if (on) {
        const result = await registerPush(api, { prompt: true });
        if (result === "denied") setNotice("Notifications are off for MergeMate in your device settings.");
        if (result === "unavailable") setNotice("Push notifications aren't set up for this build yet.");
        setPushOn(result === "registered");
      } else {
        await unregisterPush(api);
        setPushOn(false);
      }
    } catch (e) {
      setNotice(toUserMessage(e, "Couldn't change push notifications."));
    }
  };

  const saveMetaKey = async () => {
    setMetaKeyBusy(true);
    setNotice(null);
    try {
      await api.saveMetaKey(metaKeyInput);
      setMetaKey({ configured: true });
      setNotice("Your Meta key is saved. It is never shown again.");
    } catch (e) {
      setNotice(toUserMessage(e, "Couldn't save your Meta key."));
    } finally {
      // The key leaves the screen whether or not it was accepted.
      setMetaKeyInput("");
      setMetaKeyBusy(false);
    }
  };

  const removeMetaKey = async () => {
    setMetaKeyBusy(true);
    setNotice(null);
    try {
      await api.removeMetaKey();
      setMetaKey({ configured: false });
    } catch (e) {
      setNotice(toUserMessage(e, "Couldn't remove your Meta key."));
    } finally {
      setMetaKeyBusy(false);
    }
  };

  const handleManagePlan = () => {
    if (Platform.OS === "web") {
      router.push("/billing");
    } else {
      // iPhone storefront compliant linking out
      Linking.openURL(`${webAppOrigin(apiMode)}/billing`);
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
      {isLoading ? (
        <LoadingState
          title="Loading settings..."
          message="Fetching your account preferences and plan status."
        />
      ) : loadError ? (
        <ErrorState
          title="Could not load settings"
          message={loadError}
          onRetry={loadSettingsData}
        />
      ) : !user && !isDemo && !settings ? (
        <EmptyState
          icon="settings-outline"
          title="Not signed in"
          message="Sign in with GitHub or start demo mode to manage your MergeMate settings."
          actionTitle="Go to Sign In"
          onAction={() => router.replace("/(auth)/sign-in")}
        />
      ) : (
        <ScrollView contentContainerStyle={{ padding: isDesktop ? 24 : spacing.base, paddingBottom: 60, flexDirection:isDesktop?"row":"column",flexWrap:isDesktop?"wrap":"nowrap",gap:isDesktop?16:0 }}>
          {(notice || consentError) && (
            <View
              style={[styles.sectionCard, isDesktop && styles.webSectionCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border, borderRadius: radius.lg, marginBottom: spacing.base }]}
              accessibilityRole="alert"
            >
              <Text style={[typography.callout, { color: colors.text }]}>{notice ?? consentError}</Text>
            </View>
          )}

          {/* Account Profile Card */}
          <View style={[styles.sectionCard, isDesktop && styles.webSectionCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg }]}>
            <View style={styles.userRow}>
              <View style={[styles.avatar, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
                <Icon name="person-outline" size={24} color={colors.textSecondary} />
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
          <View style={[styles.sectionCard, isDesktop && styles.webSectionCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, marginTop: isDesktop ? 0 : spacing.base }]}>
            <Text
              style={[typography.subhead, { color: colors.textMuted, textTransform: "uppercase" }]}
              accessibilityRole="header"
            >
              Plan & Usage
            </Text>
            <View style={styles.planHeader}>
              <View style={{ flex: 1, paddingRight: spacing.sm }}>
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
                <Text style={[typography.caption, { color: colors.brandLight, fontWeight: "700", textTransform: "uppercase" }]}>
                  {billing.status.replace(/_/g, " ")}
                </Text>
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
          <View style={[styles.sectionCard, isDesktop && styles.webSectionCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, marginTop: isDesktop ? 0 : spacing.base }]}>
            <Text
              style={[typography.subhead, { color: colors.textMuted, textTransform: "uppercase" }]}
              accessibilityRole="header"
            >
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
                value={aiConsentGranted && (settings?.aiSummaries ?? true)}
                onValueChange={toggleAi}
                disabled={isDemo || !settings}
                accessibilityLabel="AI summaries and risk scoring"
                trackColor={{ false: colors.surfaceSecondary, true: colors.brand }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>

          {/* Notifications & Quiet Hours (US-17) */}
          <View style={[styles.sectionCard, isDesktop && styles.webSectionCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, marginTop: isDesktop ? 0 : spacing.base }]}>
            <Text
              style={[typography.subhead, { color: colors.textMuted, textTransform: "uppercase" }]}
              accessibilityRole="header"
            >
              Notifications
            </Text>

            {([
              ["review", "Review requests", "When someone asks you to review a pull request."],
              ["mention", "Mentions", "When someone mentions you."],
              ["mine", "My pull requests", "Activity on pull requests you opened."],
            ] as const).map(([kind, label, hint]) => (
              <View key={kind} style={styles.row}>
                <View style={{ flex: 1, paddingRight: spacing.md }}>
                  <Text style={[typography.headline, { color: colors.text }]}>{label}</Text>
                  <Text style={[typography.footnote, { color: colors.textSecondary, marginTop: 2 }]}>{hint}</Text>
                </View>
                <Switch
                  value={settings?.notifications[kind] ?? true}
                  onValueChange={(val) => {
                    void saveSettings({ notifications: { ...settings!.notifications, [kind]: val } });
                  }}
                  disabled={isDemo || !settings}
                  accessibilityLabel={label}
                  trackColor={{ false: colors.surfaceSecondary, true: colors.brand }}
                  thumbColor="#FFFFFF"
                />
              </View>
            ))}

            <View style={styles.row}>
              <View style={{ flex: 1, paddingRight: spacing.md }}>
                <Text style={[typography.headline, { color: colors.text }]}>Quiet Hours</Text>
                <Text style={[typography.footnote, { color: colors.textSecondary, marginTop: 2 }]}>
                  {settings?.quietHours
                    ? `Silence notifications from ${settings.quietHours.start} to ${settings.quietHours.end}.`
                    : "Silence notifications overnight (22:00 to 08:00)."}
                </Text>
              </View>
              <Switch
                value={settings?.quietHours != null}
                onValueChange={toggleQuietHours}
                disabled={isDemo || !settings}
                accessibilityLabel="Quiet hours"
                trackColor={{ false: colors.surfaceSecondary, true: colors.brand }}
                thumbColor="#FFFFFF"
              />
            </View>

            {Platform.OS !== "web" && !isDemo && (
              <View style={styles.row}>
                <View style={{ flex: 1, paddingRight: spacing.md }}>
                  <Text style={[typography.headline, { color: colors.text }]}>Push on this device</Text>
                  <Text style={[typography.footnote, { color: colors.textSecondary, marginTop: 2 }]}>
                    Get a push when a pull request needs you.
                  </Text>
                </View>
                <Switch
                  value={pushOn}
                  onValueChange={togglePush}
                  accessibilityLabel="Push notifications on this device"
                  trackColor={{ false: colors.surfaceSecondary, true: colors.brand }}
                  thumbColor="#FFFFFF"
                />
              </View>
            )}
          </View>

          {/* Bring your own Meta key: entered on the web only, never shown again; iOS shows whether one is set */}
          {metaKey && !isDemo && (
            <View style={[styles.sectionCard, isDesktop && styles.webSectionCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, marginTop: isDesktop ? 0 : spacing.base }]}>
              <Text
                style={[typography.subhead, { color: colors.textMuted, textTransform: "uppercase" }]}
                accessibilityRole="header"
              >
                Your Meta key
              </Text>
              <Text style={[typography.footnote, { color: colors.textSecondary, marginTop: 4 }]}>
                {metaKey.configured
                  ? "MergeMate is using your own Meta key for summaries. It is stored encrypted and never shown again."
                  : "Optional. Add your own Meta key and MergeMate uses it for summaries."}
              </Text>
              {Platform.OS === "web" ? (
                <>
                  <TextInput
                    value={metaKeyInput}
                    onChangeText={setMetaKeyInput}
                    placeholder={metaKey.configured ? "Paste a new key to replace it" : "Paste your Meta key"}
                    placeholderTextColor={colors.textMuted}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    spellCheck={false}
                    autoComplete="off"
                    accessibilityLabel="Meta key"
                    style={[styles.keyInput, { backgroundColor: colors.surfaceElevated, borderColor: colors.border, color: colors.text, borderRadius: radius.md, marginTop: spacing.sm }]}
                  />
                  <Button
                    title="Save key"
                    onPress={saveMetaKey}
                    loading={metaKeyBusy}
                    disabled={metaKeyInput.trim().length === 0}
                    variant="secondary"
                    style={{ marginTop: spacing.sm }}
                  />
                  {metaKey.configured && (
                    <Button title="Remove key" onPress={removeMetaKey} disabled={metaKeyBusy} variant="ghost" style={{ marginTop: spacing.xs }} />
                  )}
                </>
              ) : (
                <Text style={[typography.headline, { color: colors.text, marginTop: spacing.sm }]}>
                  {metaKey.configured ? "Using your key" : "Not set. Add one in the web app."}
                </Text>
              )}
            </View>
          )}

          {/* Appearance */}
          <View style={[styles.sectionCard, isDesktop && styles.webSectionCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, marginTop: isDesktop ? 0 : spacing.base }]}>
            <Text
              style={[typography.subhead, { color: colors.textMuted, textTransform: "uppercase" }]}
              accessibilityRole="header"
            >
              Appearance
            </Text>
            <View style={[styles.themeRow, { marginTop: spacing.sm }]} accessibilityRole="radiogroup">
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
                  accessibilityRole="radio"
                  accessibilityLabel={`${mode} theme`}
                  accessibilityState={{ checked: themeMode === mode }}
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
          <View style={[styles.sectionCard, isDesktop && styles.webSectionCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, marginTop: isDesktop ? 0 : spacing.base }]}>
            <Text
              style={[typography.subhead, { color: colors.textMuted, textTransform: "uppercase", marginBottom: spacing.xs }]}
              accessibilityRole="header"
            >
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
                accessibilityRole="link"
                accessibilityLabel={item.label}
              >
                <Text style={[typography.body, { color: colors.text }]}>{item.label}</Text>
                <Icon name="chevron-forward" size={18} color={colors.textMuted} />
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
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  webSectionCard: { flexBasis:"47%", flexGrow:1, minWidth:280 },
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
    minHeight: 44,
  },
  keyInput: {
    minHeight: 44,
    padding: 12,
    borderWidth: 1,
  },
  themeRow: {
    flexDirection: "row",
    gap: 8,
  },
  themeTab: {
    flex: 1,
    minHeight: 44,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
    paddingVertical: 12,
  },
});
