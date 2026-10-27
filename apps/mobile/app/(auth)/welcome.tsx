import React, { useState } from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "../../src/context/ThemeContext";
import { Button } from "../../src/components/Button";

const CARDS = [
  {
    step: "01",
    title: "Catch up fast",
    subtitle: "One unified inbox sorted by priority. Read AI-generated pull request summaries in seconds instead of drowning in notifications.",
    icon: "⚡",
  },
  {
    step: "02",
    title: "Know what's risky",
    subtitle: "Clear risk ratings with exact reasons. Detect credential leaks, un-migrated schemas, and auth modifications before they hit main.",
    icon: "🛡",
  },
  {
    step: "03",
    title: "You stay in control",
    subtitle: "Strictly read-only GitHub access. MergeMate never merges, approves, or comments on your behalf. Your code is never stored.",
    icon: "🔒",
  },
];

export default function WelcomeScreen() {
  const router = useRouter();
  const { colors, typography, spacing, radius, isDark } = useTheme();
  const [activeStep, setActiveStep] = useState(0);

  const next = () => {
    if (activeStep < CARDS.length - 1) {
      setActiveStep(activeStep + 1);
    } else {
      router.push("/(auth)/sign-in");
    }
  };

  const card = CARDS[activeStep];

  return (
    <View style={[styles.container, { backgroundColor: colors.background, padding: spacing.xl }]}>
      <View style={styles.topBar}>
        <Image
          source={isDark ? require("../../assets/logo-dark.png") : require("../../assets/logo-light.png")}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel="MergeMate"
        />
        <TouchableOpacity
          onPress={() => router.push("/(auth)/sign-in")}
          accessibilityRole="button"
          accessibilityLabel="Skip onboarding"
        >
          <Text style={[typography.subhead, { color: colors.textSecondary }]}>Skip</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <View style={[styles.iconCircle, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
          <Text style={styles.cardIcon}>{card.icon}</Text>
        </View>

        <Text style={[typography.caption, { color: colors.brandLight, fontWeight: "700", marginTop: spacing.lg }]}>
          STEP {card.step} OF 03
        </Text>

        <Text style={[typography.largeTitle, { color: colors.text, marginTop: spacing.xs, textAlign: "center" }]}>
          {card.title}
        </Text>

        <Text
          style={[
            typography.body,
            { color: colors.textSecondary, marginTop: spacing.md, textAlign: "center", maxWidth: 320 },
          ]}
        >
          {card.subtitle}
        </Text>
      </View>

      <View style={styles.footer}>
        <View style={styles.dots}>
          {CARDS.map((_, i) => (
            <TouchableOpacity
              key={i}
              onPress={() => setActiveStep(i)}
              style={[
                styles.dot,
                {
                  backgroundColor: i === activeStep ? colors.brandLight : colors.surfaceSecondary,
                  width: i === activeStep ? 24 : 8,
                  borderRadius: radius.full,
                },
              ]}
              accessibilityLabel={`Go to step ${i + 1}`}
            />
          ))}
        </View>

        <Button
          title={activeStep === CARDS.length - 1 ? "Get Started" : "Continue"}
          onPress={next}
          variant="primary"
          style={{ width: "100%", marginTop: spacing.lg }}
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
    width: 140,
    height: 36,
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
  cardIcon: {
    fontSize: 42,
  },
  footer: {
    alignItems: "center",
    paddingBottom: 16,
  },
  dots: {
    flexDirection: "row",
    gap: 6,
  },
  dot: {
    height: 8,
  },
});
