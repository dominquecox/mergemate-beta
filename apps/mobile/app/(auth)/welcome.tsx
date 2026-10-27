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
import { Icon, IconName } from "../../src/components/Icon";
import { useAndroidBackHandler } from "../../src/platform/android";

const CARDS = [
  {
    step: "01",
    title: "Catch up fast",
    subtitle:
      "One unified inbox sorted by priority. Read plain-language pull request summaries in seconds instead of digging through long notifications.",
    icon: "flash-outline" as IconName,
  },
  {
    step: "02",
    title: "Know what's risky",
    subtitle:
      "Clear risk ratings with exact reasons. Spot possible secret leaks, schema changes, and auth edits before you review.",
    icon: "shield-checkmark-outline" as IconName,
  },
  {
    step: "03",
    title: "You stay in control",
    subtitle:
      "Strictly read-only GitHub access. MergeMate never merges, approves, or comments on your behalf, and never stores your code.",
    icon: "lock-closed-outline" as IconName,
  },
];

export default function WelcomeScreen() {
  const router = useRouter();
  const { colors, typography, spacing, radius, isDark } = useTheme();
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
    <View style={[styles.container, { backgroundColor: colors.background, padding: spacing.xl }]}>
      <View style={styles.topBar}>
        <Image
          source={isDark ? require("../../assets/logo-dark.png") : require("../../assets/logo-light.png")}
          style={styles.logo}
          resizeMode="contain"
          accessibilityRole="image"
          accessibilityLabel="MergeMate"
        />
        <TouchableOpacity
          onPress={goToSignIn}
          style={styles.skipBtn}
          accessibilityRole="button"
          accessibilityLabel="Skip intro and go to sign in"
        >
          <Text style={[typography.subhead, { color: colors.textSecondary, fontWeight: "600" }]}>Skip</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{paddingVertical:20,gap:20}}>
        <Text style={[typography.caption,{color:colors.brandLight,letterSpacing:1.5}]}>STEP {card.step} OF 03</Text>
        <OnboardingPreview step={activeStep}/>
        <View style={{gap:10}}><View style={{flexDirection:"row",gap:8,alignItems:"center"}}><Icon name={card.icon} size={16} color={colors.brandLight}/><Text style={[typography.caption,{color:colors.brandLight}]}>{["LIGHTNING REVIEWS","RISK MATRIX","HUMAN IN THE LOOP"][activeStep]}</Text></View>
        <Text style={[typography.largeTitle,{color:colors.text}]} accessibilityRole="header">{card.title}</Text>
        <Text style={[typography.body,{color:colors.textSecondary}]}>{card.subtitle}</Text></View>
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.dots} accessibilityRole="tablist">
          {CARDS.map((item, i) => (
            <TouchableOpacity
              key={item.step}
              onPress={() => setActiveStep(i)}
              style={styles.dotHitBox}
              accessibilityRole="tab"
              accessibilityLabel={`Step ${i + 1}: ${item.title}`}
              accessibilityState={{ selected: i === activeStep }}
            >
              <View
                style={[
                  styles.dot,
                  {
                    backgroundColor: i === activeStep ? colors.brandLight : colors.borderLight,
                    width: i === activeStep ? 24 : 8,
                    borderRadius: radius.full,
                  },
                ]}
              />
            </TouchableOpacity>
          ))}
        </View>

        <Button
          title={activeStep === CARDS.length - 1 ? "Get Started" : "Continue"}
          onPress={next}
          variant="primary"
          style={{ width: "100%", marginTop: spacing.md }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "space-between",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
  },
  logo: {
    width: 148,
    height: 36,
  },
  skipBtn: {
    minHeight: 44,
    minWidth: 56,
    paddingHorizontal: 8,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  content: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 32,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  footer: {
    alignItems: "center",
    paddingBottom: 16,
  },
  dots: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  dotHitBox: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    height: 8,
  },
});
