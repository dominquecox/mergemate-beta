import { Section } from "../../src/components/ScreenDesign";
import React, { useState, useEffect, useCallback } from "react";
import { View, ScrollView, TouchableOpacity, StyleSheet, Linking, Platform } from "react-native";
import { Text } from "../../src/components/Text";
import { Redirect } from "expo-router";
import { useTheme } from "../../src/context/ThemeContext";
import { api } from "../../src/api";
import { toUserMessage } from "../../src/api/errors";
import { BillingPlan } from "../../src/types";
import { BILLING_CONFIG, billingAttention, billingStatusLabel, canStartCheckout } from "../../src/config/billing";
import { Header } from "../../src/components/Header";
import { Button } from "../../src/components/Button";
import { EmptyState } from "../../src/components/EmptyState";
import { ErrorState } from "../../src/components/ErrorState";
import { LoadingState } from "../../src/components/LoadingState";
import { Icon } from "../../src/components/Icon";

/** "November 4, 2026" in the person's locale. */
const formatBillingDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

export default function BillingScreen() {
  if (Platform.OS !== "web") {
    return <Redirect href="/(tabs)/settings" />;
  }

  const { colors, typography, spacing, radius } = useTheme();

  const [billing, setBilling] = useState<BillingPlan | null>(null);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("annual");
  const [isFetchingPlan, setIsFetchingPlan] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBilling = useCallback(async () => {
    setIsFetchingPlan(true);
    setError(null);
    try {
      const plan = await api.getBillingPlan();
      setBilling(plan);
    } catch (e) {
      setError(toUserMessage(e, "We couldn't load your plan details right now. Please try again."));
    } finally {
      setIsFetchingPlan(false);
    }
  }, []);

  useEffect(() => {
    loadBilling();
  }, [loadBilling]);

  // Back from the billing portal or another device: refresh quietly so the plan shown is current.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      api.getBillingPlan().then(setBilling).catch(() => undefined);
    };
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, []);

  const handleUpgrade = async (priceKey: "pro_monthly" | "pro_annual") => {
    setIsLoading(true);
    setError(null);
    try {
      const { url } = await api.createCheckoutSession(priceKey);
      if (Platform.OS === "web") {
        window.location.href = url;
      } else {
        Linking.openURL(url);
      }
    } catch (e) {
      setError(toUserMessage(e, "Failed to initiate checkout session."));
    } finally {
      setIsLoading(false);
    }
  };

  const handlePortal = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { url } = await api.createPortalSession();
      if (Platform.OS === "web") {
        window.location.href = url;
      } else {
        Linking.openURL(url);
      }
    } catch (e) {
      setError(toUserMessage(e, "Failed to open billing portal."));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Header title="Plans & Billing" showBack />
      {isFetchingPlan ? (
        <LoadingState
          title="Loading plan details..."
          message="Checking your subscription status."
        />
      ) : error ? (
        <ErrorState
          title="Couldn't load billing"
          message={error}
          onRetry={loadBilling}
        />
      ) : !billing ? (
        <EmptyState
          icon="card-outline"
          title="Plan details unavailable"
          message="We couldn't find subscription details for this account."
          actionTitle="Reload Plan"
          onAction={loadBilling}
        />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.base, paddingBottom: 60 }}>

         {/* Current Plan Card */}
          <Section title="Your subscription" icon="card-outline">
            <View style={[styles.planHeader,{flexWrap:"wrap",gap:12}]}>
              <View>
                <Text style={[typography.caption, { color: colors.textMuted, textTransform: "uppercase" }]}>
                  Current Subscription
                </Text>
                <Text
                  style={[typography.title1, { color: colors.text, textTransform: "capitalize", marginTop: 2 }]}
                  accessibilityRole="header"
                >
                  {billing.plan} Plan
                </Text>
              </View>
              <View style={[styles.badge, { backgroundColor: colors.brandSubtle }]}>
                <Text style={[typography.caption, { color: colors.brandLight, fontWeight: "700" }]}>
                  {billingStatusLabel(billing.status).toUpperCase()}
                </Text>
              </View>
            </View>

            <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.xs }]}>
              {billing.plan === "pro"
                ? "More AI summaries and risk checks every day, triage deck, secret alerts, and live pull request updates."
                : canStartCheckout(billing.status)
                  ? "Upgrade to Pro for more AI summaries and risk checks every day across your team repositories."
                  : "Your subscription is waiting on a payment. Free limits apply until it goes through."}
            </Text>

            {(billing.cancelAt || billing.renewsAt) && (
              <Text style={[typography.callout, { color: colors.text, marginTop: spacing.xs }]}>
                {billing.cancelAt
                  ? `Pro ends on ${formatBillingDate(billing.cancelAt)}. You keep Pro until then.`
                  : `${billing.status === "trialing" ? "Trial ends and billing starts" : "Renews"} on ${formatBillingDate(billing.renewsAt!)}.`}
              </Text>
            )}
            {billingAttention(billing.status) && (
              <Text style={[typography.callout, { color: colors.riskMedium, marginTop: spacing.xs }]} accessibilityRole="alert">
                {billingAttention(billing.status)}
              </Text>
            )}

            {billing.canManage && (
              <Button
                title="Manage Billing in Customer Portal"
                onPress={handlePortal}
                loading={isLoading}
                variant="secondary"
                style={{ marginTop: spacing.md }}
              />
            )}
          </Section>

          {/* Pricing Comparison (US-19) */}
          {billing.plan === "free" && canStartCheckout(billing.status) && (
            <View style={{ marginTop: spacing.lg }}>
              <Text
                style={[typography.title2, { color: colors.text, textAlign: "center" }]}
                accessibilityRole="header"
              >
                Upgrade to MergeMate Pro
              </Text>
              <Text style={[typography.body, { color: colors.textSecondary, textAlign: "center", marginTop: 4 }]}>
                Unleash high-throughput code review intelligence across all your team repos.
              </Text>

              {/* Cycle Selector */}
              <View
                style={[styles.cycleRow, { backgroundColor: colors.surfaceElevated, borderRadius: radius.full, marginTop: spacing.md }]}
                accessibilityRole="radiogroup"
              >
                <TouchableOpacity
                  onPress={() => setBillingCycle("monthly")}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: billingCycle === "monthly", checked: billingCycle === "monthly" }}
                  aria-checked={billingCycle === "monthly"}
                  accessibilityLabel={`Monthly plan, ${BILLING_CONFIG.pro.monthly.label}`}
                  style={[
                    styles.cycleTab,
                    {
                      backgroundColor: billingCycle === "monthly" ? colors.brand : "transparent",
                      borderRadius: radius.full,
                    },
                  ]}
                >
                  <Text style={[typography.caption, { color: billingCycle === "monthly" ? "#FFFFFF" : colors.textSecondary, fontWeight: "700" }]}>
                    Monthly ({BILLING_CONFIG.pro.monthly.label})
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setBillingCycle("annual")}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: billingCycle === "annual", checked: billingCycle === "annual" }}
                  aria-checked={billingCycle === "annual"}
                  accessibilityLabel={`Annual plan, ${BILLING_CONFIG.pro.annual.label}, 25 percent off`}
                  style={[
                    styles.cycleTab,
                    {
                      backgroundColor: billingCycle === "annual" ? colors.brand : "transparent",
                      borderRadius: radius.full,
                    },
                  ]}
                >
                  <Text style={[typography.caption, { color: billingCycle === "annual" ? "#FFFFFF" : colors.textSecondary, fontWeight: "700" }]}>
                    Annual ({BILLING_CONFIG.pro.annual.label} · 25% Off)
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Pro Card */}
              <Section style={{marginTop:16,borderColor:colors.brand,padding:24}}>
                <View style={[styles.planHeader,{flexWrap:"wrap",gap:12}]}>
                  <View>
                    <Text style={[typography.title2, { color: colors.text }]} accessibilityRole="header">
                      {BILLING_CONFIG.pro.name}
                    </Text>
                    {billing.trialEligible && (
                      <Text style={[typography.caption, { color: colors.riskLow, fontWeight: "700", marginTop: 2 }]}>
                        {BILLING_CONFIG.pro.monthly.trialLabel} included
                      </Text>
                    )}
                  </View>
                  <View style={{alignItems:"flex-start",width:"100%",marginTop:12}}>
                    <Text style={[typography.title1, { color: colors.brandLight, fontWeight: "700" }]}>
                      {billingCycle === "monthly"
                        ? `$${BILLING_CONFIG.pro.monthly.priceDollars}`
                        : `$${BILLING_CONFIG.pro.annual.priceDollars}`}
                      <Text style={[typography.callout, { color: colors.textSecondary }]}>
                        /{billingCycle === "monthly" ? "mo" : "yr"}
                      </Text>
                    </Text>
                    <Text style={[typography.caption, { color: colors.textMuted,flexShrink:1 }]}>
                      {billingCycle === "monthly"
                        ? BILLING_CONFIG.pro.monthly.billingText
                        : BILLING_CONFIG.pro.annual.billingText}
                      {billing.trialEligible ? " after a 7-day free trial" : ""}
                    </Text>
                  </View>
                </View>

                <View style={{ marginTop: spacing.md, gap: 8 }}>
                  {BILLING_CONFIG.pro.features.map((feat, idx) => (
                    <View key={idx} style={styles.featRow}>
                      <Icon name="checkmark-circle" size={16} color={colors.riskLow} />
                      <Text style={[typography.callout, { color: colors.text }]}>{feat}</Text>
                    </View>
                  ))}
                </View>

                <Button
                  title={`${billing.trialEligible ? "Start 7-Day Free Trial" : "Upgrade to Pro"} (${
                    billingCycle === "monthly" ? BILLING_CONFIG.pro.monthly.label : BILLING_CONFIG.pro.annual.label
                  })`}
                  onPress={() =>
                    handleUpgrade(
                      billingCycle === "monthly"
                        ? BILLING_CONFIG.pro.monthly.priceKey
                        : BILLING_CONFIG.pro.annual.priceKey
                    )
                  }
                  loading={isLoading}
                  variant="primary"
                  style={{ marginTop: spacing.lg }}
                />
              </Section>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  planHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  cycleRow: {
    flexDirection: "row",
    padding: 4,
    alignSelf: "stretch",
    flexWrap: "wrap",
  },
  cycleTab: {
    flexGrow: 1,
    flexBasis: "45%",
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
    minWidth: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  featRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
});
