import { describe, expect, it } from 'vitest';

import { fontFamilyForWeight } from '../src/theme/fontFamily';
import { palette, typography, radius } from '../src/theme';
const luminance=(hex:string)=>{
  const rgb=hex.slice(1).match(/../g)?.map(part=>parseInt(part,16)/255).map(c=>c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4)??[];
  return (rgb[0]??0)*0.2126+(rgb[1]??0)*0.7152+(rgb[2]??0)*0.0722;
};
const contrast=(fg:string,bg:string)=>{const a=luminance(fg),b=luminance(bg);return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);};
describe('Shared Stitch theme',()=>{
  it('maps explicit UI weights to bundled faces and preserves code families',()=>{
    expect(fontFamilyForWeight(undefined)).toBe('Geist_400Regular');
    expect(fontFamilyForWeight('Geist_400Regular','600')).toBe('Geist_600SemiBold');
    expect(fontFamilyForWeight('Geist_500Medium','bold')).toBe('Geist_700Bold');
    expect(fontFamilyForWeight('Geist_600SemiBold','normal')).toBe('Geist_400Regular');
    expect(fontFamilyForWeight('JetBrainsMono_400Regular','700')).toBe('JetBrainsMono_400Regular');
  });
  it('uses the prose canvas/surface tokens and structural radii',()=>{
    expect(palette.dark.background).toBe('#0B0F17');expect(palette.dark.surface).toBe('#131B2A');expect(palette.dark.surfaceElevated).toBe('#1B2538');
    expect(palette.light.background).toBe('#F8FAFC');expect(palette.light.surface).toBe('#FFFFFF');expect(palette.light.surfaceElevated).toBe('#F1F5F9');
    expect(radius).toMatchObject({sm:8,md:12,lg:16,full:9999});
  });
  it('keeps readable text and labeled risk foregrounds at AA contrast in both themes',()=>{
    for(const c of Object.values(palette)){
      for(const bg of [c.background,c.surface,c.surfaceElevated])for(const fg of [c.text,c.textSecondary,c.textMuted,c.brandLight])expect(contrast(fg,bg)).toBeGreaterThanOrEqual(4.5);
      for(const [fg,bg] of [[c.riskLow,c.riskLowBg],[c.riskMedium,c.riskMediumBg],[c.riskHigh,c.riskHighBg]])expect(contrast(fg??'',bg??'')).toBeGreaterThanOrEqual(4.5);
      expect(contrast('#FFFFFF',c.brand)).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('bundles the required UI and code faces with tabular metadata, shared by native and web',()=>{
    expect(typography.body.fontFamily).toBe('Geist_400Regular');expect(typography.code.fontFamily).toBe('JetBrainsMono_400Regular');expect(typography.code.fontVariant).toContain('tabular-nums');
    expect(palette.dark.background).toBe('#0B0F17');expect(radius.lg).toBe(16);expect(typography.code.fontFamily).toBe('JetBrainsMono_400Regular');
  });
});
