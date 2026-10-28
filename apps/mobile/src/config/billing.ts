export const BILLING_CONFIG = {
  pro: {
    name: "MergeMate Pro",
    monthly: {
      priceDollars: 12,
      label: "$12/month",
      tag: "$12/mo",
      billingText: "$12 billed monthly",
      priceKey: "pro_monthly" as const,
      trialDays: 7,
      trialLabel: "7-day free trial",
    },
    annual: {
      priceDollars: 108,
      pricePerMonthDollars: 9,
      label: "$108/year",
      tag: "$108/yr (Save 25%)",
      billingText: "$108 billed annually ($9/month equivalent)",
      priceKey: "pro_annual" as const,
      trialDays: 7,
      trialLabel: "7-day free trial",
    },
    features: [
      "More AI summaries and risk checks every day",
      "Triage deck",
      "Secret alerts",
      "Live pull request updates",
      "Manage your plan anytime",
    ],
  },
  free: {
    name: "Free",
    features: [
      "AI summaries and risk checks",
      "Triage deck",
      "Secret alerts",
      "Repository review filters",
    ],
  },
} as const;

/** Plain words for a Stripe subscription status. Unknown statuses fall back to a neutral label, never raw text. */
export function billingStatusLabel(status: string): string {
  switch (status) {
    case "none": return "Free";
    case "trialing": return "Trial";
    case "active": return "Active";
    case "past_due": return "Payment due";
    case "unpaid": return "Unpaid";
    case "canceled": return "Canceled";
    case "incomplete": return "Payment pending";
    case "incomplete_expired": return "Checkout expired";
    case "paused": return "Paused";
    default: return "Updating";
  }
}

/** What a person needs to do about their plan, or null when nothing. */
export function billingAttention(status: string): string | null {
  if (status === "past_due" || status === "unpaid") return "Your last payment didn't go through, so Pro is paused. Update your payment method in the billing portal to restore it.";
  if (status === "incomplete") return "Your payment is still being confirmed. This page updates when it is.";
  return null;
}

export type CheckoutOutcome = "trial" | "pro" | "pending";

/** What the success page may say, from the server's plan only. */
export function checkoutOutcome(plan: { plan: "free" | "pro"; status: string }): CheckoutOutcome {
  if (plan.plan !== "pro") return "pending";
  return plan.status === "trialing" ? "trial" : "pro";
}

/** A new checkout is possible only without a live subscription (the API refuses one otherwise; use the portal). */
export function canStartCheckout(status: string): boolean {
  return status === "none" || status === "canceled" || status === "incomplete_expired";
}
