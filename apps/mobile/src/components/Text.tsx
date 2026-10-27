import React, { forwardRef } from 'react';
import { Text as NativeText, StyleSheet, type TextProps } from 'react-native';
import { fontFamilyForWeight } from '../theme/fontFamily';

/** Map style overrides to real local font weights while preserving code faces. */
export const Text = forwardRef<React.ComponentRef<typeof NativeText>, TextProps>(function Text(
  { style, ...props }, ref,
) {
  const resolved = StyleSheet.flatten(style);
  const family = fontFamilyForWeight(resolved?.fontFamily, resolved?.fontWeight);
  return <NativeText {...props} ref={ref} style={[style, { fontFamily: family }, family.startsWith("Geist_") && { fontWeight: "normal" }]} />;
});
