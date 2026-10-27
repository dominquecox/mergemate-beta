import React, { forwardRef } from 'react';
import { Text as NativeText, StyleSheet, type TextProps } from 'react-native';
import { fontFamilyForWeight } from '../theme/fontFamily';

/** Map style overrides to real local font weights while preserving code faces and supporting up to 200% font scaling. */
export const Text = forwardRef<React.ComponentRef<typeof NativeText>, TextProps>(function Text(
  { style, maxFontSizeMultiplier = 2, ...props }, ref,
) {
  const resolved = StyleSheet.flatten(style);
  const family = fontFamilyForWeight(resolved?.fontFamily, resolved?.fontWeight);
  return (
    <NativeText
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      {...props}
      ref={ref}
      style={[style, { fontFamily: family }, family.startsWith("Geist_") && { fontWeight: "normal" }]}
    />
  );
});
