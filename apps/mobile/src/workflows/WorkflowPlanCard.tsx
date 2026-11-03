import React from 'react';
import { View, Pressable } from 'react-native';
import type { WorkflowDefinition } from '@mergemate/contracts';
import { Text } from '../components/Text';
import { Icon, type IconName } from '../components/Icon';
import { useTheme } from '../context/ThemeContext';

export function WorkflowPlanCard({
  definition,
  onInspectCanvas,
}: {
  definition: WorkflowDefinition;
  onInspectCanvas?: () => void;
}) {
  const { colors, typography } = useTheme();
  const enabledCount = definition.steps.filter((s) => s.enabled).length;
  const targetLabel = `${definition.target.owner}/${definition.target.repo}${definition.target.number ? `#${definition.target.number}` : ''}`;
  const rows: { icon: IconName; label: string; value: string }[] = [
    {
      icon: 'git-pull-request-outline',
      label: 'Trigger & Target',
      value: `${targetLabel} (${(definition.target.kind ?? 'pull_request').replace('_', ' ')})`,
    },
    {
      icon: 'layers-outline',
      label: 'Action Pipeline',
      value: `${enabledCount} active steps (${definition.steps.filter((s) => s.enabled).map((s) => s.kind).join(' → ')})`,
    },
    {
      icon: 'shield-checkmark-outline',
      label: 'Execution Mode',
      value: definition.mode === 'code_fix' ? 'Isolated Runner + Draft PR (Explicit Consent)' : 'Read-Only AI Review & QA Evidence',
    },
    {
      icon: 'flash-outline',
      label: 'Frequency',
      value: 'On-demand durable queue run pinned to HEAD SHA',
    },
  ];

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.brandMuted,
        borderWidth: 1,
        borderRadius: 16,
        padding: 14,
        gap: 10,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            backgroundColor: colors.brand,
            paddingHorizontal: 9,
            paddingVertical: 3,
            borderRadius: 8,
          }}
        >
          <Icon name="sparkles" size={11} color="#FFFFFF" />
          <Text style={[typography.code, { color: '#FFFFFF', fontSize: 10, fontWeight: '700' }]}>MergeMateAI</Text>
        </View>
        <Text style={[typography.caption, { color: colors.brandLight }]}>
          {definition.mode === 'code_fix' ? 'Coding Flow' : 'Review Flow'}
        </Text>
      </View>

      <Text style={[typography.footnote, { color: colors.textSecondary }]}>
        Great! I have structured an executable automation workflow for your target. Here is what is configured:
      </Text>

      <View
        style={{
          backgroundColor: colors.surfaceElevated,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 12,
          gap: 10,
        }}
      >
        <View style={{ gap: 2 }}>
          <Text style={[typography.subhead, { color: colors.text, fontWeight: '700' }]}>{definition.name}</Text>
          <Text numberOfLines={2} style={[typography.caption, { color: colors.textSecondary }]}>
            {definition.intent}
          </Text>
        </View>

        <View style={{ gap: 8 }}>
          {rows.map((row) => (
            <View key={row.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 9,
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name={row.icon} size={15} color={colors.brandLight} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[typography.caption, { color: colors.text, fontWeight: '600' }]}>{row.label}</Text>
                <Text numberOfLines={1} style={[typography.caption, { color: colors.textSecondary }]}>
                  {row.value}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {onInspectCanvas && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Inspect workflow graph"
            onPress={onInspectCanvas}
            style={({ pressed }) => ({
              minHeight: 44,
              borderRadius: 10,
              backgroundColor: colors.brand,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 6,
              marginTop: 2,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Icon name="git-network-outline" size={15} color="#FFFFFF" />
            <Text style={[typography.subhead, { color: '#FFFFFF', fontWeight: '700' }]}>Create Automation</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
