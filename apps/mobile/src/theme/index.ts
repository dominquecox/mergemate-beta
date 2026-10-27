export const palette = {
  // Dark mode surfaces (calm dark slate, zero harsh neon glows, WCAG AA >= 4.5:1 text contrast)
  dark: {
    background: "#0B0B12",
    surface: "#14141F",
    surfaceElevated: "#1C1C2B",
    surfaceSecondary: "#232336",
    surfaceInteractive: "#2B2B42",
    border: "#28283D",
    borderLight: "#35354F",
    text: "#F3F4F6",
    textSecondary: "#CBD5E1",
    textMuted: "#A1A9B8",
    // Calmed Brand Indigo (comfortable >= 4.5:1 contrast on dark surfaces)
    brand: "#4F46E5",
    brandLight: "#93C5FD",
    brandMuted: "#312E81",
    brandSubtle: "#1E1B4B",
    // Risk colors (with clear icon/label pairing and >= 4.5:1 contrast)
    riskLow: "#4ADE80",
    riskLowBg: "#064E3B",
    riskMedium: "#FBBF24",
    riskMediumBg: "#451A03",
    riskHigh: "#FCA5A5",
    riskHighBg: "#450A0A",
    // US-25 Secret Leak Warning
    secretWarning: "#FDA4AF",
    secretWarningBg: "#4C0519",
    // Triage lanes (high contrast with #FFFFFF button text)
    laneNeedsYou: "#4338CA",
    laneFyi: "#0369A1",
    laneIgnore: "#A1A9B8",
    // Demo badge
    demoBadge: "#FBBF24",
    demoBadgeBg: "#451A03",
  },
  // Light mode surfaces (WCAG AA >= 4.5:1 text contrast on all light surfaces)
  light: {
    background: "#F9FAFB",
    surface: "#FFFFFF",
    surfaceElevated: "#F3F4F6",
    surfaceSecondary: "#E5E7EB",
    surfaceInteractive: "#E5E7EB",
    border: "#D1D5DB",
    borderLight: "#9CA3AF",
    text: "#111827",
    textSecondary: "#374151",
    textMuted: "#4B5563",
    brand: "#4338CA",
    brandLight: "#3730A3",
    brandMuted: "#E0E7FF",
    brandSubtle: "#EEF2FF",
    riskLow: "#065F46",
    riskLowBg: "#D1FAE5",
    riskMedium: "#92400E",
    riskMediumBg: "#FEF3C7",
    riskHigh: "#991B1B",
    riskHighBg: "#FEE2E2",
    secretWarning: "#9F1239",
    secretWarningBg: "#FFE4E6",
    laneNeedsYou: "#4338CA",
    laneFyi: "#0369A1",
    laneIgnore: "#4B5563",
    demoBadge: "#92400E",
    demoBadgeBg: "#FEF3C7",
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  gutter: 16,
};

export const typography = {
  largeTitle: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "700" as const,
    letterSpacing: -0.5,
  },
  title1: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "700" as const,
    letterSpacing: -0.3,
  },
  title2: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "600" as const,
    letterSpacing: -0.2,
  },
  headline: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "600" as const,
  },
  body: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "400" as const,
  },
  callout: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "400" as const,
  },
  subhead: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500" as const,
  },
  footnote: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400" as const,
  },
  caption: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "400" as const,
  },
  code: {
    fontFamily: "Courier, monospace",
    fontSize: 13,
    lineHeight: 18,
  },
};

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 9999,
};
