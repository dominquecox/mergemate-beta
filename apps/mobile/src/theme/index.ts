export const palette = {
  // Dark mode surfaces (calm dark slate, zero harsh neon glows)
  dark: {
    background: "#0B0B12",
    surface: "#14141F",
    surfaceElevated: "#1C1C2B",
    surfaceSecondary: "#232336",
    surfaceInteractive: "#2B2B42",
    border: "#28283D",
    borderLight: "#35354F",
    text: "#F3F4F6",
    textSecondary: "#9CA3AF",
    textMuted: "#6B7280",
    // Calmed Brand Indigo (less neon, comfortable contrast)
    brand: "#4F46E5",
    brandLight: "#6366F1",
    brandMuted: "#312E81",
    brandSubtle: "#1E1B4B",
    // Risk colors (with clear icon/label pairing)
    riskLow: "#10B981",
    riskLowBg: "#064E3B",
    riskMedium: "#F59E0B",
    riskMediumBg: "#78350F",
    riskHigh: "#EF4444",
    riskHighBg: "#7F1D1D",
    // US-25 Secret Leak Warning
    secretWarning: "#F43F5E",
    secretWarningBg: "#881337",
    // Triage lanes
    laneNeedsYou: "#6366F1",
    laneFyi: "#0284C7",
    laneIgnore: "#6B7280",
    // Demo badge
    demoBadge: "#D97706",
    demoBadgeBg: "#451A03",
  },
  // Light mode surfaces
  light: {
    background: "#F9FAFB",
    surface: "#FFFFFF",
    surfaceElevated: "#F3F4F6",
    surfaceSecondary: "#E5E7EB",
    surfaceInteractive: "#E5E7EB",
    border: "#E5E7EB",
    borderLight: "#D1D5DB",
    text: "#111827",
    textSecondary: "#4B5563",
    textMuted: "#9CA3AF",
    brand: "#4F46E5",
    brandLight: "#6366F1",
    brandMuted: "#E0E7FF",
    brandSubtle: "#EEF2FF",
    riskLow: "#059669",
    riskLowBg: "#D1FAE5",
    riskMedium: "#D97706",
    riskMediumBg: "#FEF3C7",
    riskHigh: "#DC2626",
    riskHighBg: "#FEE2E2",
    secretWarning: "#E11D48",
    secretWarningBg: "#FFE4E6",
    laneNeedsYou: "#4F46E5",
    laneFyi: "#0284C7",
    laneIgnore: "#6B7280",
    demoBadge: "#D97706",
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
