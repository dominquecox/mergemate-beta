import React, { useState } from "react";
import { View, ScrollView, Image, TouchableOpacity, StyleSheet } from "react-native";
import { Text } from "../../src/components/Text";
import { useRouter } from "expo-router";
import { useTheme } from "../../src/context/ThemeContext";
import { Button } from "../../src/components/Button";
import { EmptyState } from "../../src/components/EmptyState";
import { ErrorState } from "../../src/components/ErrorState";
import { LoadingState } from "../../src/components/LoadingState";
import { OnboardingPreview } from "../../src/components/OnboardingPreview";
import { ExperienceIntro } from "../../src/components/ExperienceDesign";
import { Icon } from "../../src/components/Icon";
import { useAndroidBackHandler } from "../../src/platform/android";
import { useLayout } from "../../src/layout/useLayout";

const CARDS = [
  {
    step: "01",
    title: "Automate reviews.\nShip with evidence.",
    subtitle:
      "One high-density workspace for AI pull request review, visual agent workflows, and real QA evidence.",
  },
  {
    step: "02",
    title: "Visual workflows\nfrom a single prompt.",
    subtitle:
      "Describe what you want to automate and inspect an editable node graph for PR risk, QA verification, or draft PR fixes.",
  },
  {
    step: "03",
    title: "Your repositories.\nYour guardrails.",
    subtitle:
      "Choose your repositories, set your AI consent preferences, and inspect every workflow step before taking action.",
  },
];

export default function WelcomeScreen() {
  const router = useRouter();
  const { isDesktop } = useLayout();
  const { colors, typography, spacing, isDark } = useTheme();
  const [activeStep, setActiveStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useAndroidBackHandler(() => {
    if (activeStep > 0) {
      setActiveStep((prev) => prev - 1);
      return true;
    }
    return false;
  }, activeStep > 0);

  const goToSignIn = () => {
    try {
      setIsLoading(true);
      setError(null);
      router.push("/(auth)/sign-in");
      setIsLoading(false);
    } catch (e: any) {
      setIsLoading(false);
      setError(e?.message || "Could not open sign-in screen. Please try again.");
    }
  };

  const next = () => {
    if (activeStep < CARDS.length - 1) {
      setActiveStep(activeStep + 1);
    } else {
      goToSignIn();
    }
  };

  const card = CARDS[activeStep];

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, padding: spacing.xl }]}>
        <LoadingState title="Opening sign in..." message="Preparing your sign-in options." />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, padding: spacing.xl }]}>
        <ErrorState title="Could not continue" message={error} onRetry={goToSignIn} />
      </View>
    );
  }

  if (!card) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, padding: spacing.xl }]}>
        <EmptyState
          title="Welcome to MergeMate"
          message="Continue to sign in or try the demo with sample pull requests."
          actionTitle="Continue to Sign In"
          onAction={goToSignIn}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background, padding: isDesktop ? 28 : 18 }]}>
      <View style={styles.topBar}>
        <Image
          source={isDark ? require("../../assets/logo-dark.png") : require("../../assets/logo-light.png")}
          style={styles.logo}
          resizeMode="contain"
          accessibilityRole="image"
          accessibilityLabel="MergeMate"
        />
        {activeStep < CARDS.length - 1 && (
          <TouchableOpacity
            onPress={goToSignIn}
            style={styles.skipBtn}
            accessibilityRole="button"
            accessibilityLabel="Skip intro and go to sign in"
          >
            <Text style={[typography.subhead, { color: colors.textSecondary, fontWeight: "600" }]}>Skip</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 18, paddingBottom: 20, gap: 18 }} showsVerticalScrollIndicator={false}>
        <View style={[styles.bentoMain, isDesktop && styles.bentoMainDesktop]}>
          <View style={[styles.leftCol, isDesktop && { flex: 5 }]}>
            <ExperienceIntro eyebrow={`Your work, connected · ${card.step} / 03`} title={card.title} description={card.subtitle} />
            <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
              {(["Overview", "Workflows", "Your controls"] as const).map((label, index) => (
                <TouchableOpacity
                  key={label}
                  onPress={() => setActiveStep(index)}
                  accessibilityRole="button"
                  accessibilityLabel={`Explore ${label}`}
                  accessibilityState={{ selected: index === activeStep }}
                  aria-pressed={index === activeStep}
                  style={{
                    flex: 1,
                    minHeight: 44,
                    paddingHorizontal: 8,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: index === activeStep ? colors.brandMuted : colors.border,
                    backgroundColor: index === activeStep ? colors.brandSubtle : colors.surface,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={[typography.caption, { color: index === activeStep ? colors.brandLight : colors.textSecondary, fontSize: 11, fontWeight: "600" }]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={[styles.rightCol, isDesktop && { flex: 7 }]}>
            <OnboardingPreview step={activeStep} />
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 7, alignSelf: "flex-start", marginBottom: 10 }}>
          <Icon name="git-network-outline" size={14} color={colors.brandLight} />
          <Text style={[typography.caption, { color: colors.textSecondary }]}>Built for the way your team reviews and automates.</Text>
        </View>

        <Button
          title={activeStep === CARDS.length - 1 ? "Get Started" : "Continue"}
          onPress={next}
          variant="primary"
          style={{ width: "100%", borderRadius: 14, minHeight: 48 }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "flex-start" },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 4, minHeight: 48 },
  logo: { width: 140, height: 34 },
  skipBtn: { minHeight: 44, minWidth: 56, paddingHorizontal: 8, alignItems: "flex-end", justifyContent: "center" },
  bentoMain: { gap: 16 },
  bentoMainDesktop: { flexDirection: "row", alignItems: "center", gap: 24 },
  leftCol: { minWidth: 0 },
  rightCol: { minWidth: 0 },
  footer: { alignItems: "center", paddingTop: 10, paddingBottom: 8 },
});
