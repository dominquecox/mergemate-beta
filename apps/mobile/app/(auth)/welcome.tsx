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

const CARDS = [
  {
    step: "01",
    title: "Less busywork.\nMore momentum.",
    subtitle:
      "One place for your pull requests, AI-assisted review and the workflows that move your work forward.",
  },
  {
    step: "02",
    title: "Give every change\na clearer path.",
    subtitle:
      "Bring context, evidence and verification into a connected review flow. See what happened and what needs your attention.",
  },
  {
    step: "03",
    title: "Your workflow.\nYour next move.",
    subtitle:
      "Choose your repositories, set your AI preferences and inspect the evidence. Your workspace keeps its controls within reach.",
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
        {activeStep < CARDS.length - 1 && <TouchableOpacity
          onPress={goToSignIn}
          style={styles.skipBtn}
          accessibilityRole="button"
          accessibilityLabel="Skip intro and go to sign in"
        >
          <Text style={[typography.subhead, { color: colors.textSecondary, fontWeight: "600" }]}>Skip</Text>
        </TouchableOpacity>}
      </View>

      <ScrollView style={{flex:1}} contentContainerStyle={{paddingTop:24,paddingBottom:20,gap:22}} showsVerticalScrollIndicator={false}>
        <ExperienceIntro eyebrow={`Your work, connected · ${card.step} / 03`} title={card.title} description={card.subtitle}/>
        <OnboardingPreview step={activeStep}/>
        <View style={{flexDirection:"row",gap:8}}>
          {(["Overview","Workflows","Your controls"] as const).map((label,index)=><TouchableOpacity key={label} onPress={()=>setActiveStep(index)} accessibilityRole="button" accessibilityLabel={`Explore ${label}`} accessibilityState={{selected:index===activeStep}} aria-pressed={index===activeStep} style={{flex:1,minHeight:44,paddingHorizontal:6,borderRadius:14,backgroundColor:index===activeStep?colors.brandSubtle:colors.surface,alignItems:"center",justifyContent:"center"}}><Text style={[typography.caption,{color:index===activeStep?colors.brandLight:colors.textSecondary,fontSize:11}]}>{label}</Text></TouchableOpacity>)}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <View style={{flexDirection:"row",alignItems:"center",gap:7,alignSelf:"flex-start",marginBottom:12}}><Icon name="git-network-outline" size={14} color={colors.brandLight}/><Text style={[typography.caption,{color:colors.textSecondary}]}>Built for the way your team moves.</Text></View>

        <Button
          title={activeStep === CARDS.length - 1 ? "Get Started" : "Continue"}
          onPress={next}
          variant="primary"
          style={{ width: "100%", borderRadius: 16, minHeight:52 }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex:1,justifyContent:"flex-start"},
  topBar: {flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingTop:8,minHeight:52},
  logo: {width:148,height:36},
  skipBtn: {minHeight:44,minWidth:56,paddingHorizontal:8,alignItems:"flex-end",justifyContent:"center"},
  footer: {alignItems:"center",paddingTop:12,paddingBottom:12},
});
