import { Section, InfoLine } from "../../src/components/ScreenDesign";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, StyleSheet, Platform } from "react-native";
import { Text } from "../../src/components/Text";
import { useRouter, Redirect } from "expo-router";
import { useTheme } from "../../src/context/ThemeContext";
import { api } from "../../src/api";
import { toUserMessage } from "../../src/api/errors";
import { Header } from "../../src/components/Header";
import { Button } from "../../src/components/Button";
import { EmptyState } from "../../src/components/EmptyState";
import { ErrorState } from "../../src/components/ErrorState";
import { LoadingState } from "../../src/components/LoadingState";
import { checkoutOutcome, type CheckoutOutcome } from "../../src/config/billing";

/** Stripe confirms a subscription by webhook, usually within seconds. Check a few times before saying it is pending. */
const CHECKS = 5;
const CHECK_INTERVAL_MS = 2000;

export default function BillingSuccessScreen() {
  if (Platform.OS !== "web") {
    return <Redirect href="/(tabs)/settings" />;
  }

  const router = useRouter();
  const { colors, typography, spacing } = useTheme();
  const [outcome, setOutcome] = useState<CheckoutOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = useRef(0);

  // Only the server's plan says the upgrade happened; arriving on this page proves nothing by itself.
  const confirm = useCallback(async () => {
    const id = ++run.current;
    setOutcome(null);
    setError(null);
    for (let attempt = 0; attempt < CHECKS; attempt++) {
      try {
        const plan = await api.getBillingPlan();
        if (id !== run.current) return;
        const result = checkoutOutcome(plan);
        if (result !== "pending" || attempt === CHECKS - 1) {
          setOutcome(result);
          return;
        }
      } catch (e) {
        if (id !== run.current) return;
        setError(toUserMessage(e, "We couldn't check your plan right now. Please try again."));
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, CHECK_INTERVAL_MS));
    }
  }, []);

  useEffect(() => {
    void confirm();
    return () => {
      run.current++;
    };
  }, [confirm]);

  const copy: Record<CheckoutOutcome, { title: string; body: string }> = {
    trial: { title: "Your trial has started", body: "MergeMate Pro is on for 7 days. You can cancel any time in the billing portal before the trial ends." },
    pro: { title: "You're on MergeMate Pro", body: "Your subscription is active. Manage or cancel it any time from Plans & Billing." },
    pending: { title: "Confirming your subscription", body: "Stripe hasn't confirmed it yet. This usually takes under a minute, and checking again never charges you." },
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Header title="Checkout" />
      {error ? (
        <ErrorState title="Couldn't check your plan" message={error} onRetry={confirm} />
      ) : !outcome ? (
        <LoadingState title="Confirming your subscription..." message="Checking your plan with billing." />
      ) : outcome === "pending" ? (
        <EmptyState icon="time-outline" title={copy.pending.title} message={copy.pending.body} actionTitle="Check again" onAction={confirm} />
      ) : (
        <View style={[styles.content, { padding: spacing.xl }]}>
          <Section
            title={copy[outcome].title}
            icon="checkmark-circle-outline"
            style={{ width: "100%", maxWidth: 480 }}
          >
            <Text style={{ color: colors.textSecondary, ...typography.body }} accessibilityLiveRegion="polite">
              {copy[outcome].body}
            </Text>
            <InfoLine icon="shield-checkmark-outline" title="Secure billing" detail="Payments and cancellations are handled in the Stripe billing portal." />
          </Section>
          <Button
            title="Return to Inbox"
            onPress={() => router.replace("/(tabs)/inbox")}
            variant="primary"
            style={{ width: "100%", maxWidth: 320, marginTop: spacing.md }}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
