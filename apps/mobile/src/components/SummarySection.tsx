import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from './Text';
import { Icon, type IconName } from './Icon';
import { useTheme } from '../context/ThemeContext';

/** One labelled part of the AI summary. Flat on purpose: the surrounding AI card already provides the surface. */
export function SummarySection({title,icon,children}:{title:string;icon:IconName;children:React.ReactNode}) {
  const {colors,typography}=useTheme();
  return <View style={{gap:4,paddingTop:12,borderTopWidth:1,borderTopColor:colors.border}}><View style={{flexDirection:'row',gap:6,alignItems:'center'}}><Icon name={icon} size={14} color={colors.textMuted}/><Text style={[typography.caption,{color:colors.textMuted,letterSpacing:0.4}]}>{title}</Text></View>{children}</View>;
}

/** Tightens long narrative AI copy into scannable executive text with 3-line clamp and bullet expansion. */
export function ExecutiveSummaryText({ text }: { text: string }) {
  const { colors, typography } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 140;

  const parts = text.includes(';')
    ? text.split(';').map((p) => p.trim()).filter(Boolean)
    : text.split(/(?<=[.!?])\s+(?=[A-Z])/).map((p) => p.trim()).filter(Boolean);

  if (parts.length > 1 && expanded) {
    return (
      <View style={{ gap: 6 }}>
        {parts.map((part, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-start' }}>
            <Text style={{ color: colors.brandLight, lineHeight: 20 }}>•</Text>
            <Text style={[typography.callout, { color: colors.text, flex: 1, lineHeight: 20 }]}>{part}</Text>
          </View>
        ))}
        {isLong && (
          <Pressable accessibilityRole="button" accessibilityLabel="Show less details" onPress={() => setExpanded(false)} style={{ alignSelf: 'flex-start', marginTop: 2, minHeight: 32, justifyContent: 'center' }}>
            <Text style={[typography.caption, { color: colors.brandLight, fontWeight: '600' }]}>Show less</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <View style={{ gap: 4 }}>
      <Text style={[typography.callout, { color: colors.text, lineHeight: 20 }]} numberOfLines={expanded ? undefined : 3}>
        {text}
      </Text>
      {isLong && !expanded && (
        <Pressable accessibilityRole="button" accessibilityLabel="Show full summary details" onPress={() => setExpanded(true)} style={{ alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center' }}>
          <Text style={[typography.caption, { color: colors.brandLight, fontWeight: '600' }]}>Show details</Text>
        </Pressable>
      )}
      {isLong && expanded && (
        <Pressable accessibilityRole="button" accessibilityLabel="Show less details" onPress={() => setExpanded(false)} style={{ alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center' }}>
          <Text style={[typography.caption, { color: colors.brandLight, fontWeight: '600' }]}>Show less</Text>
        </Pressable>
      )}
    </View>
  );
}
