import React from 'react';
import { View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Text } from './Text';
import { Icon, type IconName } from './Icon';
import { useTheme } from '../context/ThemeContext';
import { useLayout } from '../layout/useLayout';

/** Every shortcut opens an existing capability; counts describe only the loaded queue. */
export function InboxOverview({ count, needsReview }: { count: number; needsReview: number }) {
  const { colors, typography } = useTheme();
  const { isDesktop } = useLayout();
  const router = useRouter();
  const actions: { label: string; icon: IconName; run: () => void }[] = [
    { label: 'Find a PR', icon: 'search-outline', run: () => router.push('/search') },
    { label: 'Triage deck', icon: 'layers-outline', run: () => router.push('/(tabs)/triage') },
    { label: 'Playbooks', icon: 'git-network-outline', run: () => router.push('/workflows') },
    { label: 'Your alerts', icon: 'notifications-outline', run: () => router.push('/(tabs)/notifications') },
  ];
  return <View style={{ gap: 20, marginBottom: 24 }}>
    <View style={{ padding: isDesktop ? 28 : 22, borderRadius: 24, borderWidth: 1, borderColor: colors.brandMuted, backgroundColor: colors.brandSubtle, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginBottom: 16 }}>
        <Icon name="sparkles-outline" size={15} color={colors.brandLight} />
        <Text style={[typography.code, { color: colors.brandLight, fontSize: 11, letterSpacing: 1.2 }]}>YOUR REVIEW WORKSPACE</Text>
      </View>
      <Text accessibilityRole="header" style={[isDesktop ? typography.largeTitle : typography.title1, { color: colors.text, maxWidth: 520 }]}>Less noise. A clearer next move.</Text>
      <Text style={[typography.body, { color: colors.textSecondary, marginTop: 10, maxWidth: 460 }]}>Understand the risk, follow the evidence, and keep your reviews moving.</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Open review playbooks" onPress={() => router.push('/workflows')} style={({ pressed }) => ({ marginTop: 22, minHeight: 48, paddingHorizontal: 16, borderRadius: 14, backgroundColor: colors.brand, alignSelf: 'flex-start', flexDirection: 'row', gap: 9, alignItems: 'center', opacity: pressed ? 0.8 : 1 })}>
        <Icon name="git-network-outline" size={18} color="#FFFFFF" />
        <Text style={[typography.subhead, { color: '#FFFFFF', fontWeight: '700' }]}>Build your review flow</Text>
        <Icon name="arrow-forward-outline" size={17} color="#FFFFFF" />
      </Pressable>
    </View>
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {actions.map(action => <Pressable key={action.label} accessibilityRole="button" accessibilityLabel={action.label} onPress={action.run} style={({ pressed }) => ({ flex: 1, minWidth: 0, minHeight: 88, alignItems: 'center', gap: 8, justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
        <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}><Icon name={action.icon} size={21} color={colors.text} /></View>
        <Text numberOfLines={1} style={[typography.caption, { color: colors.textSecondary }]}>{action.label}</Text>
      </Pressable>)}
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <Text accessibilityRole="header" style={[typography.headline, { color: colors.text }]}>Your review queue</Text>
      <Text style={[typography.caption, { color: colors.textSecondary }]}>{count} loaded · {needsReview} review</Text>
    </View>
  </View>;
}
