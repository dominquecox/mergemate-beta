import { palette, typography } from './index';

/** Stitch prose tokens for web. Native keeps the established iOS theme. */
export const webPalette = {
  dark: {
    ...palette.dark,
    background: '#0B0F17', surface: '#131B2A', surfaceElevated: '#1B2538',
    surfaceSecondary: '#1B2538', surfaceInteractive: '#253248', border: '#253248', borderLight: '#475569',
    text: '#F8FAFC', textSecondary: '#94A3B8', textMuted: '#94A3B8',
    brand: '#4F46E5', brandLight: '#A5B4FC', brandMuted: '#3730A3', brandSubtle: '#202947',
    riskLow: '#6EE7B7', riskLowBg: '#123A32', riskMedium: '#FCD34D', riskMediumBg: '#3B2D18',
    riskHigh: '#FCA5A5', riskHighBg: '#42212A', laneFyi: '#0369A1', laneNeedsYou: '#4F46E5',
  },
  light: {
    ...palette.light,
    background: '#F8FAFC', surface: '#FFFFFF', surfaceElevated: '#F1F5F9',
    surfaceSecondary: '#E2E8F0', surfaceInteractive: '#E2E8F0', border: '#E2E8F0', borderLight: '#CBD5E1',
    text: '#0F172A', textSecondary: '#475569', textMuted: '#475569',
    brand: '#4F46E5', brandLight: '#4F46E5', brandSubtle: '#EEF2FF', brandMuted: '#E0E7FF',
    riskLow: '#047857', riskLowBg: '#D1FAE5', riskMedium: '#92400E', riskMediumBg: '#FEF3C7',
    riskHigh: '#B91C1C', riskHighBg: '#FEE2E2', laneNeedsYou: '#4F46E5',
  },
};
// Readable foreground shades are used on tinted/raised surfaces; the semantic
// emerald/amber/crimson accents remain paired with both an icon and a label.
export const webTypography = {
  ...typography,
  largeTitle: { ...typography.largeTitle, fontFamily:'Geist_700Bold', fontSize:34, lineHeight:41 },
  title1: { ...typography.title1, fontFamily:'Geist_700Bold', fontSize:28, lineHeight:34 },
  title2: { ...typography.title2, fontFamily:'Geist_600SemiBold', fontSize:22, lineHeight:28 },
  headline: { ...typography.headline, fontFamily:'Geist_600SemiBold' },
  body: { ...typography.body, fontFamily:'Geist_400Regular' },
  callout: { ...typography.callout, fontFamily:'Geist_400Regular' },
  subhead: { ...typography.subhead, fontFamily:'Geist_500Medium' },
  footnote: { ...typography.footnote, fontFamily:'Geist_400Regular', fontSize:13, lineHeight:18 },
  caption: { ...typography.caption, fontFamily:'Geist_500Medium', fontSize:12, lineHeight:16 },
  code: { ...typography.code, fontFamily:'JetBrainsMono_400Regular', fontVariant:['tabular-nums'] as 'tabular-nums'[] },
};
export const webRadius = { sm:8, md:12, lg:16, xl:16, full:9999 };
