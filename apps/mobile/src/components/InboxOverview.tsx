import React, { useState } from 'react';
import { View, Pressable, TextInput } from 'react-native';
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
  const [promptText, setPromptText] = useState('');

  const actions: { label: string; detail: string; icon: IconName; run: () => void }[] = [
    { label: 'Find a PR', detail: 'Search repos & pulls', icon: 'search-outline', run: () => router.push('/search') },
    { label: 'Triage deck', detail: 'Fast priority sweep', icon: 'layers-outline', run: () => router.push('/(tabs)/triage') },
    { label: 'Agents', detail: 'Visual node workflows', icon: 'git-network-outline', run: () => router.push('/workflows') },
    { label: 'Your alerts', detail: 'Mentions & activity', icon: 'notifications-outline', run: () => router.push('/(tabs)/notifications') },
  ];

  const openWorkflowBuilder = (mode?: 'review' | 'code_fix') => {
    const trimmed = promptText.trim();
    const isGithubUrl = /^https:\/\/github\.com\/[-A-Za-z0-9_.]+\/[-A-Za-z0-9_.]+/.test(trimmed);
    const params: Record<string, string> = {};
    if (isGithubUrl) params.target = trimmed;
    if (mode) params.mode = mode;
    router.push({ pathname: '/workflows', params });
  };

  const heroCard = (
    <View
      style={{
        flex: isDesktop ? 7 : undefined,
        padding: isDesktop ? 20 : 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.brandMuted,
        backgroundColor: colors.brandSubtle,
        justifyContent: 'space-between',
        gap: 12,
      }}
    >
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: colors.surface, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1, borderColor: colors.brandMuted }}>
            <Icon name="sparkles" size={12} color={colors.brandLight} />
            <Text style={[typography.code, { color: colors.brandLight, fontSize: 10, letterSpacing: 1 }]}>MERGEMATE AI</Text>
          </View>
          <Text style={[typography.caption, { color: colors.textSecondary }]}>
            {count} loaded · {needsReview} needs review
          </Text>
        </View>
        <Text accessibilityRole="header" style={[isDesktop ? typography.title1 : typography.title2, { color: colors.text, marginTop: 2 }]}>
          What would you like to automate today?
        </Text>
        <Text style={[typography.footnote, { color: colors.textSecondary, maxWidth: 520 }]}>
          Tell me what you want to review or fix, and I will help you build the workflow.
        </Text>
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          backgroundColor: colors.surface,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.brandMuted,
          paddingLeft: 12,
          paddingRight: 4,
          paddingVertical: 4,
        }}
      >
        <Icon name="sparkles-outline" size={15} color={colors.brandLight} />
        <TextInput
          accessibilityLabel="Quick automation prompt"
          value={promptText}
          onChangeText={setPromptText}
          onSubmitEditing={() => openWorkflowBuilder()}
          placeholder="Review a pull request or paste a GitHub link to automate..."
          placeholderTextColor={colors.textMuted}
          style={[
            typography.footnote,
            {
              flex: 1,
              minHeight: 36,
              color: colors.text,
              paddingVertical: 4,
            },
          ]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open agent workflows"
          onPress={() => openWorkflowBuilder()}
          style={({ pressed }) => ({
            width: 44,
            height: 44,
            borderRadius: 10,
            backgroundColor: colors.brand,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Icon name="arrow-forward" size={18} color="#FFFFFF" />
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Build PR review workflow"
          onPress={() => openWorkflowBuilder('review')}
          style={({ pressed }) => ({
            minHeight: 44,
            paddingHorizontal: 11,
            paddingVertical: 6,
            borderRadius: 10,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Icon name="shield-checkmark-outline" size={14} color={colors.brandLight} />
          <Text style={[typography.caption, { color: colors.text, fontWeight: '600' }]}>PR Risk & QA Flow</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Build coding fix workflow"
          onPress={() => openWorkflowBuilder('code_fix')}
          style={({ pressed }) => ({
            minHeight: 44,
            paddingHorizontal: 11,
            paddingVertical: 6,
            borderRadius: 10,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Icon name="code-slash-outline" size={14} color={colors.brandLight} />
          <Text style={[typography.caption, { color: colors.text, fontWeight: '600' }]}>Issue Fix to Draft PR</Text>
        </Pressable>
      </View>
    </View>
  );

  const actionGrid = isDesktop ? (
    <View style={{ flex: 5, gap: 10 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, flex: 1 }}>
        {actions.map((action) => (
          <Pressable
            key={action.label}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            onPress={action.run}
            style={({ pressed }) => ({
              flexBasis: '47%',
              flexGrow: 1,
              minHeight: 74,
              padding: 12,
              borderRadius: 14,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: 11,
                backgroundColor: colors.surfaceElevated,
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name={action.icon} size={18} color={colors.brandLight} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={[typography.subhead, { color: colors.text, fontWeight: '600' }]}>
                {action.label}
              </Text>
              <Text numberOfLines={1} style={[typography.caption, { color: colors.textSecondary, marginTop: 1 }]}>
                {action.detail}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  ) : (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {actions.map((action) => (
        <Pressable
          key={action.label}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onPress={action.run}
          style={({ pressed }) => ({
            flex: 1,
            minWidth: 0,
            minHeight: 68,
            alignItems: 'center',
            gap: 6,
            justifyContent: 'center',
            opacity: pressed ? 0.75 : 1,
          })}
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 13,
              backgroundColor: colors.surface,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Icon name={action.icon} size={19} color={colors.brandLight} />
          </View>
          <Text numberOfLines={1} style={[typography.caption, { color: colors.textSecondary, fontSize: 11 }]}>
            {action.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );

  return (
    <View style={{ gap: 14, marginBottom: 14 }}>
      {isDesktop ? (
        <View style={{ flexDirection: 'row', gap: 14, alignItems: 'stretch' }}>
          {heroCard}
          {actionGrid}
        </View>
      ) : (
        <>
          {heroCard}
          {actionGrid}
        </>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 2 }}>
        <Text accessibilityRole="header" style={[typography.headline, { color: colors.text }]}>
          Upcoming & Active Reviews
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="See all workflows"
          onPress={() => router.push('/workflows')}
          style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 }}
        >
          <Text style={[typography.caption, { color: colors.brandLight, fontWeight: '600' }]}>Workflows →</Text>
        </Pressable>
      </View>
    </View>
  );
}
