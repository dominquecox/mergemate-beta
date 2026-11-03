import { ExperienceIntro, ExperienceSurface, SetupPath } from "../../src/components/ExperienceDesign";
import { InfoLine } from "../../src/components/ScreenDesign";
import React, { useState } from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import { Text } from "../../src/components/Text";
import { useRouter } from "expo-router";
import { useTheme } from "../../src/context/ThemeContext";
import { useConsent } from "../../src/context/ConsentContext";
import { Button } from "../../src/components/Button";
import { Header } from "../../src/components/Header";
import { EmptyState } from "../../src/components/EmptyState";
import { LoadingState } from "../../src/components/LoadingState";
import { Icon } from "../../src/components/Icon";
import { ErrorState } from "../../src/components/ErrorState";
import { useAuth } from "../../src/context/AuthContext";

const SENT = [
  "PR summaries and risk: the title and description, changed file names, selected parts of the diff and check results. Large PRs are only partly analyzed, and the screen says how much.",
  "Screenshots (Highlight): the screenshot you choose, only when you pick it. A screenshot can show anything on your screen, so check it before you choose one.",
  "Voice notes: the audio you record, only when you ask for a transcript.",
];

const LIMITS = [
  "Known credential patterns are masked in PR text before it is sent. This is pattern matching, not a guarantee: it can miss secrets, and it does not look inside screenshots or audio.",
  "MergeMate does not use your content to train its own models. How the AI provider handles requests is set by that provider's terms; MergeMate has not verified more than that.",
  "MergeMate is read-only: AI never changes anything in GitHub.",
];

export default function ConsentScreen() {
  const router = useRouter();
  const { colors, typography, spacing, radius } = useTheme();
  const { isDemo } = useAuth();
  const { aiConsentGranted, needsReview, isLoading, loaded, pending, error, grantConsent, revokeConsent, refreshConsent } = useConsent();
  const [saved, setSaved] = useState<"granted" | "revoked" | null>(null);
  const saving = pending === "grant" || pending === "revoke";

  const choose = async (choice: "agree" | "turn_off") => {
    const ok = choice === "agree" ? await grantConsent() : await revokeConsent();
    if (ok) setSaved(choice === "agree" ? "granted" : "revoked");
  };

  const list = (items: string[]) => (
    <Text style={[typography.callout, { color: colors.textSecondary, marginTop: 4, lineHeight: 20 }]}>
      {items.map((line) => `• ${line}`).join("\n")}
    </Text>
  );

  const box = (title: string, icon: "checkmark-circle" | "alert-circle-outline", tint: string, items: string[], first = false) => (
    <View style={[styles.box, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 22, marginTop: first ? spacing.xl : spacing.md }]}>
      <View style={styles.boxTitleRow} accessibilityRole="header">
        <Icon name={icon} size={18} color={tint} />
        <Text style={[typography.headline, { color: colors.text, flex:1 }]}>{title}</Text>
      </View>
      {list(items)}
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Header title="AI and your data" showBack />
      {isDemo ? (
        <EmptyState
          icon="sparkles-outline"
          title="Sample data"
          message="The demo shows saved examples, so nothing is sent to an AI model and there is nothing to change here."
          actionTitle="Back"
          onAction={() => router.back()}
        />
      ) : isLoading ? (
        <LoadingState title="Loading your choice..." message="Reading your AI settings." />
      ) : !loaded ? (
        <ErrorState
          title="Could not load your AI choice"
          message={error ?? "MergeMate could not read your AI choice. Nothing has been sent to an AI model."}
          onRetry={() => void refreshConsent()}
        />
      ) : saving ? (
        <LoadingState title="Saving your choice..." message="Waiting for MergeMate to confirm." />
      ) : saved ? (
        <EmptyState
          icon="checkmark-circle-outline"
          title={saved === "granted" ? "AI is on" : "AI is off"}
          message={
            saved === "granted"
              ? "MergeMate saved your agreement. You can turn AI off at any time in Settings."
              : "MergeMate saved your choice. New AI requests stop, and results still being prepared are not shown."
          }
          actionTitle="Continue to Inbox"
          onAction={() => router.replace("/(tabs)/inbox")}
        />
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { padding: spacing.xl }]}>
          <View style={{gap:20,marginBottom:20}}>
            <ExperienceIntro compact eyebrow="Your AI preferences" title={"Make AI work\non your terms."} description="Give your workspace a clear set of boundaries. Read what is shared, then choose what works for you."/>
            <SetupPath active="ai"/>
          </View>
          <ExperienceSurface accent style={{padding:16}}><InfoLine icon="person-outline" title="You choose" detail="AI is off until you agree here. Nothing is sent to an AI model before that." /></ExperienceSurface>

          {box("What may be sent to the AI model", "checkmark-circle", colors.riskLow, SENT, true)}
          {box("What to know first", "alert-circle-outline", colors.riskMedium, LIMITS)}

          <View style={[styles.notice, { backgroundColor: colors.surfaceElevated, borderRadius: 18, marginTop: spacing.md }]}>
            <Text style={[typography.caption, { color: colors.textMuted, lineHeight: 18 }]}>
              With AI summaries on, MergeMate may analyze PRs when you open them or load your inbox. Turning AI off stops new requests and
              blocks results that were still being prepared, but cannot recall anything already sent. Agreeing here covers all of the
              features above; AI summaries and risk can also be turned off on their own in Settings.
            </Text>
          </View>

          {needsReview && !aiConsentGranted ? (
            <View accessibilityRole="alert" style={[styles.notice, { backgroundColor: colors.surfaceElevated, borderRadius: 18, marginTop: spacing.md }]}>
              <Text style={[typography.body, { color: colors.text }]}>This text has changed since you last agreed. Read it again and choose.</Text>
            </View>
          ) : null}

          {error ? (
            <View accessibilityRole="alert" style={[styles.notice, { backgroundColor: colors.surfaceElevated, borderRadius: 18, marginTop: spacing.md }]}>
              <Text style={[typography.body, { color: colors.text }]}>{error}</Text>
              <Button title="Reload my choice" onPress={() => void refreshConsent()} variant="secondary" style={{ marginTop: spacing.sm }} />
            </View>
          ) : null}

          <View style={[styles.actions, { marginTop: spacing.xl }]}>
            {aiConsentGranted ? (
              <>
                <Text style={[typography.body, { color: colors.text, marginBottom: spacing.sm }]}>AI is on for your account.</Text>
                <Button title="Turn off AI" onPress={() => choose("turn_off")} variant="secondary" style={{ width: "100%",borderRadius:16,minHeight:52 }} />
              </>
            ) : (
              <>
                <Button title="I agree, turn on AI" onPress={() => choose("agree")} variant="primary" style={{ width: "100%",borderRadius:16,minHeight:52 }} />
                <Button title="Not now" onPress={() => router.back()} variant="secondary" style={{ width: "100%", marginTop: spacing.sm,borderRadius:16,minHeight:52 }} />
              </>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  noticeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  noticeIcon: {
    marginTop: 1,
  },
  boxTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  root: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    alignItems: "stretch",
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  box: {
    width: "100%",
    padding: 16,
    borderWidth: 1,
  },
  notice: {
    width: "100%",
    padding: 12,
  },
  actions: {
    width: "100%",
  },
});
