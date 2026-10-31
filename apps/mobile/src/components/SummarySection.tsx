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

export interface FormattedInsight {
  title?: string;
  body: string;
  chips: string[];
}

/** Parses raw technical log sentences into structured executive insight cards. */
export function parseInsight(raw: string): FormattedInsight {
  let text = cleanCopy(raw);
  // Strip commit SHAs like "off main 84a1c75" or "@3e017f1"
  text = text.replace(/\s+(?:off\s+main\s+|commit\s+|@)[0-9a-f]{7,40}/gi, '');

  const chips: string[] = [];

  // Extract long parenthetical lists like (yaps, vidiloop, mergemate...)
  text = text.replace(/\(([^)]+)\)/g, (match, inner) => {
    const parts = inner.split(/[,;]/).map((s: string) => s.trim()).filter(Boolean);
    if (parts.length >= 3) {
      chips.push(...parts.slice(0, 5));
      return parts.length > 5 ? `(${parts.length} product boards)` : '';
    }
    return match;
  });

  // Extract file paths like "PICKUP.md", "BOARD.md"
  const fileMatches = text.match(/\b([a-zA-Z0-9_.-]+\.(?:md|ts|tsx|json|sql|swift|ya?ml))\b/gi);
  if (fileMatches && fileMatches.length >= 2) {
    for (const file of fileMatches) {
      if (!chips.includes(file)) chips.push(file);
    }
  }

  let title: string | undefined;
  let body = text;

  if (text.includes(':') && !text.startsWith('http')) {
    const idx = text.indexOf(':');
    title = text.slice(0, idx).trim();
    body = text.slice(idx + 1).trim();
  }

  if (title) {
    title = title.replace(/^(?:and\s+added|added|adding|updated|updating|docs-only\s+pr\s+adding)\s+/i, '');
    title = title.charAt(0).toUpperCase() + title.slice(1);
  }

  body = body.replace(/^(?:new\s+|and\s+)/i, '');
  body = body.charAt(0).toUpperCase() + body.slice(1);

  return { title, body, chips: chips.slice(0, 4) };
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
        {sentences.map((sentence, i) => {
          const insight = parseInsight(sentence);
          return (
            <View
              key={i}
              style={{
                backgroundColor: colors.surfaceElevated,
                borderRadius: radius.md,
                paddingVertical: 12,
                paddingHorizontal: 14,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              {!!insight.title && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <Icon name="git-commit-outline" size={14} color={colors.brandLight} />
                  <Text style={[typography.subhead, { color: colors.text, fontWeight: '600' }]}>
                    {insight.title}
                  </Text>
                </View>
              )}
              <Text style={[typography.callout, { color: insight.title ? colors.textSecondary : colors.text, lineHeight: 21 }]}>
                {insight.body}
              </Text>
              {insight.chips.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {insight.chips.map((chip) => (
                    <View
                      key={chip}
                      style={{
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        backgroundColor: colors.surfaceSecondary,
                        borderRadius: radius.sm,
                      }}
                    >
                      <Text style={[typography.code, { fontSize: 11, color: colors.brandLight }]}>
                        {chip}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}
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
