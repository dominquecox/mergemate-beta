export const BILLING_CONFIG = {
  pro: {
    name: "MergeMate Pro",
    monthly: {
      priceDollars: 12,
      label: "$12/month",
      tag: "$12/mo",
      billingText: "$12 billed monthly · Includes 7-day free trial",
      priceKey: "pro_monthly" as const,
      trialDays: 7,
      trialLabel: "7-day free trial",
    },
    annual: {
      priceDollars: 108,
      pricePerMonthDollars: 9,
      label: "$108/year",
      tag: "$108/yr (Save 25%)",
      billingText: "$108 billed annually ($9/month equivalent) · Includes 7-day free trial",
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
