/** Shared Stitch design tokens. iOS and web use the same surfaces, type and shapes. */
export const palette = {
  dark: {
    background:'#0B0F17', surface:'#131B2A', surfaceElevated:'#1B2538',
    surfaceSecondary:'#1B2538', surfaceInteractive:'#253248', border:'#253248', borderLight:'#475569',
    text:'#F8FAFC', textSecondary:'#94A3B8', textMuted:'#94A3B8',
    brand:'#4F46E5', brandLight:'#A5B4FC', brandMuted:'#3730A3', brandSubtle:'#202947',
    riskLow:'#6EE7B7', riskLowBg:'#123A32', riskMedium:'#FCD34D', riskMediumBg:'#3B2D18',
    riskHigh:'#FCA5A5', riskHighBg:'#42212A', secretWarning:'#FDA4AF', secretWarningBg:'#4C0519',
    laneNeedsYou:'#4F46E5', laneFyi:'#0369A1', laneIgnore:'#94A3B8', demoBadge:'#FBBF24', demoBadgeBg:'#451A03',
  },
  light: {
    background:'#F8FAFC', surface:'#FFFFFF', surfaceElevated:'#F1F5F9',
    surfaceSecondary:'#E2E8F0', surfaceInteractive:'#E2E8F0', border:'#E2E8F0', borderLight:'#CBD5E1',
    text:'#0F172A', textSecondary:'#475569', textMuted:'#475569',
    brand:'#4F46E5', brandLight:'#4F46E5', brandSubtle:'#EEF2FF', brandMuted:'#E0E7FF',
    riskLow:'#047857', riskLowBg:'#D1FAE5', riskMedium:'#92400E', riskMediumBg:'#FEF3C7',
    riskHigh:'#B91C1C', riskHighBg:'#FEE2E2', secretWarning:'#9F1239', secretWarningBg:'#FFE4E6',
    laneNeedsYou:'#4F46E5', laneFyi:'#0369A1', laneIgnore:'#475569', demoBadge:'#92400E', demoBadgeBg:'#FEF3C7',
  },
};

export const spacing = {xs:4,sm:8,md:12,base:16,lg:20,xl:24,xxl:32,gutter:16};
export const typography = {
  largeTitle:{fontFamily:'Geist_700Bold',fontSize:26,lineHeight:32,fontWeight:'700' as const,letterSpacing:-0.5},
  title1:{fontFamily:'Geist_700Bold',fontSize:22,lineHeight:28,fontWeight:'700' as const,letterSpacing:-0.4},
  title2:{fontFamily:'Geist_600SemiBold',fontSize:18,lineHeight:24,fontWeight:'600' as const,letterSpacing:-0.2},
  headline:{fontFamily:'Geist_600SemiBold',fontSize:15,lineHeight:20,fontWeight:'600' as const},
  body:{fontFamily:'Geist_400Regular',fontSize:14,lineHeight:20,fontWeight:'400' as const},
  callout:{fontFamily:'Geist_400Regular',fontSize:13,lineHeight:18,fontWeight:'400' as const},
  subhead:{fontFamily:'Geist_500Medium',fontSize:13,lineHeight:18,fontWeight:'500' as const},
  footnote:{fontFamily:'Geist_400Regular',fontSize:12,lineHeight:17,fontWeight:'400' as const},
  caption:{fontFamily:'Geist_500Medium',fontSize:11,lineHeight:15,fontWeight:'500' as const},
  code:{fontFamily:'JetBrainsMono_400Regular',fontSize:12,lineHeight:16,fontVariant:['tabular-nums'] as 'tabular-nums'[]},
};
export const radius = {sm:8,md:12,lg:16,xl:16,full:9999};
