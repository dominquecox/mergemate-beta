import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from './Text';
import { Icon, type IconName } from './Icon';
import { useTheme } from '../context/ThemeContext';

/** One labelled part of the AI summary. Sleek Apple layout with clear visual hierarchy. */
export function SummarySection({
  title,
  icon,
  badge,
  children,
}: {
  title: string;
  icon: IconName;
  badge?: string;
  children: React.ReactNode;
}) {
  const { colors, typography, radius } = useTheme();
  return (
    <View style={{ gap: 6, marginTop: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          <Icon name={icon} size={13} color={colors.brandLight} />
          <Text style={[typography.caption, { color: colors.textSecondary, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' }]}>
            {title}
          </Text>
        </View>
        {badge && (
          <View style={{ backgroundColor: colors.surfaceSecondary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm }}>
            <Text style={[typography.caption, { color: colors.textMuted, fontSize: 11 }]}>{badge}</Text>
          </View>
        )}
      </View>
      {children}
    </View>
  );
}

/** Strips bullet glyphs, dash prefixes, and extraneous technical whitespace. */
export function cleanCopy(input: string): string {
  return input
    .replace(/^[\s•\-*]+/, '')
    .replace(/\n[\s•\-*]+/g, '\n')
    .trim();
}

/** Formats summary narrative into sleek, executive-grade copy. ZERO bundled bullets. */
export function ExecutiveSummaryText({ text }: { text: string }) {
  const { colors, typography, radius } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const cleaned = cleanCopy(text);
  const isLong = cleaned.length > 120;

  // Split into natural sentences for sleek insight tiles when expanded
  const sentences = cleaned.includes(';')
    ? cleaned.split(';').map((p) => cleanCopy(p)).filter(Boolean)
    : cleaned.split(/(?<=[.!?])\s+(?=[A-Z])/).map((p) => cleanCopy(p)).filter(Boolean);

  if (sentences.length > 1 && expanded) {
    return (
      <View style={{ gap: 8 }}>
        {sentences.map((sentence, i) => (
          <View
            key={i}
            style={{
              backgroundColor: colors.surfaceElevated,
              borderRadius: radius.md,
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={[typography.callout, { color: colors.text, lineHeight: 21 }]}>
              {sentence}
            </Text>
          </View>
        ))}
        {isLong && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Show less details"
            onPress={() => setExpanded(false)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              alignSelf: 'flex-start',
              paddingVertical: 4,
              paddingHorizontal: 8,
              backgroundColor: colors.surfaceSecondary,
              borderRadius: radius.sm,
              marginTop: 2,
            }}
          >
            <Text style={[typography.caption, { color: colors.brandLight, fontWeight: '600' }]}>Show less</Text>
            <Icon name="chevron-up" size={12} color={colors.brandLight} />
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <View style={{ gap: 6 }}>
      <Text
        style={[typography.callout, { color: colors.text, lineHeight: 21 }]}
        numberOfLines={expanded ? undefined : 3}
      >
        {cleaned}
      </Text>
      {isLong && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Show less details' : 'Show full summary details'}
          onPress={() => setExpanded(!expanded)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            alignSelf: 'flex-start',
            paddingVertical: 4,
            paddingHorizontal: 8,
            backgroundColor: colors.surfaceSecondary,
            borderRadius: radius.sm,
          }}
        >
          <Text style={[typography.caption, { color: colors.brandLight, fontWeight: '600' }]}>
            {expanded ? 'Show less' : 'Show details'}
          </Text>
          <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={12} color={colors.brandLight} />
        </Pressable>
      )}
    </View>
  );
}
