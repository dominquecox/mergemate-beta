import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Linking, Platform } from "react-native";
import { useRouter, Redirect } from "expo-router";
import { useTheme } from "../../src/context/ThemeContext";
import { api } from "../../src/api";
import { toUserMessage } from "../../src/api/errors";
import { BillingPlan } from "../../src/types";
import { BILLING_CONFIG } from "../../src/config/billing";
import { Header } from "../../src/components/Header";
import { Button } from "../../src/components/Button";
import { Card } from "../../src/components/Card";

export default function BillingScreen() {
  if (Platform.OS !== "web") {
    return <Redirect href="/(tabs)/settings" />;
  }

  const router = useRouter();
  const { colors, typography, spacing, radius } = useTheme();

  const [billing, setBilling] = useState<BillingPlan>({ plan: "free", status: "active" });
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("annual");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    api.getBillingPlan().then(setBilling).catch(() => {});
  }, []);

  const handleUpgrade = async (priceKey: "pro_monthly" | "pro_annual") => {
    setIsLoading(true);
    try {
      const { url } = await api.createCheckoutSession(priceKey);
      if (Platform.OS === "web") {
        window.location.href = url;
      } else {
        Linking.openURL(url);
      }
    } catch (e) {
      alert(toUserMessage(e, "Failed to initiate checkout session."));
    } finally {
      setIsLoading(false);
    }
  };

  const handlePortal = async () => {
    setIsLoading(true);
    try {
      const { url } = await api.createPortalSession();
      if (Platform.OS === "web") {
        window.location.href = url;
      } else {
        Linking.openURL(url);
      }
    } catch (e) {
      alert(toUserMessage(e, "Failed to open billing portal."));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Header title="Plans & Billing" showBack />
      <ScrollView contentContainerStyle={{ padding: spacing.base, paddingBottom: 60 }}>
        {/* Current Plan Card */}
        <Card>
          <View style={styles.planHeader}>
            <View>
              <Text style={[typography.caption, { color: colors.textMuted, textTransform: "uppercase" }]}>
                Current Subscription
              </Text>
              <Text style={[typography.title1, { color: colors.text, textTransform: "capitalize", marginTop: 2 }]}>
                {billing.plan} Plan
              </Text>
            </View>
            <View style={[styles.badge, { backgroundColor: colors.brandSubtle }]}>
              <Text style={[typography.caption, { color: colors.brandLight, fontWeight: "700" }]}>
                {billing.status.toUpperCase()}
              </Text>
            </View>
          </View>

          <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.xs }]}>
            {billing.plan === "pro"
              ? "More AI summaries and risk checks every day, triage deck, secret alerts, and live pull request updates."
              : "Upgrade to Pro for more AI summaries and risk checks every day across your team repositories."}
          </Text>

          {billing.plan === "pro" && (
            <Button
              title="Manage Billing in Customer Portal"
              onPress={handlePortal}
              loading={isLoading}
              variant="secondary"
              style={{ marginTop: spacing.md }}
            />
          )}
        </Card>

        {/* Pricing Comparison (US-19) */}
        {billing.plan === "free" && (
          <View style={{ marginTop: spacing.lg }}>
            <Text style={[typography.title2, { color: colors.text, textAlign: "center" }]}>
              Upgrade to MergeMate Pro
            </Text>
            <Text style={[typography.body, { color: colors.textSecondary, textAlign: "center", marginTop: 4 }]}>
              Unleash high-throughput code review intelligence across all your team repos.
            </Text>

            {/* Cycle Selector */}
            <View style={[styles.cycleRow, { backgroundColor: colors.surfaceElevated, borderRadius: radius.full, marginTop: spacing.md }]}>
              <TouchableOpacity
                onPress={() => setBillingCycle("monthly")}
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
            <Card elevated style={{ marginTop: spacing.md }}>
              <View style={styles.planHeader}>
                <View>
                  <Text style={[typography.title2, { color: colors.text }]}>{BILLING_CONFIG.pro.name}</Text>
                  <Text style={[typography.caption, { color: colors.riskLow, fontWeight: "700", marginTop: 2 }]}>
                    7-day free trial included
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[typography.title1, { color: colors.brandLight, fontWeight: "700" }]}>
                    {billingCycle === "monthly"
                      ? `$${BILLING_CONFIG.pro.monthly.priceDollars}`
                      : `$${BILLING_CONFIG.pro.annual.priceDollars}`}
                    <Text style={[typography.callout, { color: colors.textSecondary }]}>
                      /{billingCycle === "monthly" ? "mo" : "yr"}
                    </Text>
                  </Text>
                  <Text style={[typography.caption, { color: colors.textMuted }]}>
                    {billingCycle === "monthly"
                      ? BILLING_CONFIG.pro.monthly.billingText
                      : BILLING_CONFIG.pro.annual.billingText}
                  </Text>
                </View>
              </View>

              <View style={{ marginTop: spacing.md, gap: 8 }}>
                {BILLING_CONFIG.pro.features.map((feat, idx) => (
                  <View key={idx} style={styles.featRow}>
                    <Text style={{ color: colors.riskLow }}>✓</Text>
                    <Text style={[typography.callout, { color: colors.text }]}>{feat}</Text>
                  </View>
                ))}
              </View>

              <Button
                title={
                  billingCycle === "monthly"
                    ? `Start 7-Day Free Trial (${BILLING_CONFIG.pro.monthly.label})`
                    : `Start 7-Day Free Trial (${BILLING_CONFIG.pro.annual.label})`
                }
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
            </Card>
          </View>
        )}
      </ScrollView>
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
    alignSelf: "center",
  },
  cycleTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  featRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
});
