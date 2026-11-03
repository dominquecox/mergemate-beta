import React from 'react';
import { View, Pressable } from 'react-native';
import type { WorkflowDefinition, WorkflowStepKind } from '@mergemate/contracts';
import { Text } from '../components/Text';
import { Icon, type IconName } from '../components/Icon';
import { useTheme } from '../context/ThemeContext';
import { AGENT_STEP_META, moveAgentStep, toggleAgentStep } from './agent-model';

const BRANCH_LABELS: Record<WorkflowStepKind, { label: string; tone: 'purple' | 'green' | 'rose' }> = {
  context: { label: 'Entry Target', tone: 'purple' },
  checks: { label: 'Context Pinned', tone: 'green' },
  risk: { label: 'Diff Scanned', tone: 'purple' },
  summary: { label: 'AI Analysis', tone: 'purple' },
  review_plan: { label: 'Guide Ready', tone: 'green' },
  patch: { label: 'Needs Code Fix', tone: 'rose' },
  qa: { label: 'Patch Applied', tone: 'purple' },
  draft_pr: { label: 'Tests Passed', tone: 'green' },
  route: { label: 'Handoff Ready', tone: 'green' },
};

const NODE_AGENT_BADGE: Record<WorkflowStepKind, { label: string; icon: IconName }> = {
  context: { label: 'GitHub Snapshot', icon: 'git-commit-outline' },
  checks: { label: 'Check Verifier', icon: 'shield-checkmark-outline' },
  risk: { label: 'AI Assistant', icon: 'sparkles' },
  summary: { label: 'AI Assistant', icon: 'sparkles' },
  review_plan: { label: 'AI Assistant', icon: 'sparkles' },
  patch: { label: 'AI Coding Agent', icon: 'code-slash-outline' },
  qa: { label: 'Isolated Runner', icon: 'hardware-chip-outline' },
  draft_pr: { label: 'GitHub Publisher', icon: 'git-branch-outline' },
  route: { label: 'Routing Engine', icon: 'paper-plane-outline' },
};

export function WorkflowCanvas({
  definition,
  selectedStepIndex,
  busy,
  onSelectStep,
  onChangeDefinition,
}: {
  definition: WorkflowDefinition;
  selectedStepIndex: number | null;
  busy: boolean;
  onSelectStep: (index: number) => void;
  onChangeDefinition: (next: WorkflowDefinition | null) => void;
}) {
  const { colors, typography } = useTheme();

  return (
    <View
      style={{
        backgroundColor: colors.background,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 18,
        padding: 16,
        gap: 4,
      }}
    >
      {/* Top Canvas Header Bar */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 10,
          paddingBottom: 10,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
          <View
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              backgroundColor: colors.brandSubtle,
              borderWidth: 1,
              borderColor: colors.brandMuted,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="git-network-outline" size={15} color={colors.brandLight} />
          </View>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={[typography.subhead, { color: colors.text, fontWeight: '700' }]}>
              {definition.name}
            </Text>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>
              Visual Automation Graph · Tap any node to configure
            </Text>
          </View>
        </View>
        <View
          style={{
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 999,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text style={[typography.caption, { color: colors.brandLight, fontWeight: '600' }]}>
            {definition.steps.filter((s) => s.enabled).length}/{definition.steps.length} active
          </Text>
        </View>
      </View>

      {/* Mexas Entry Trigger Pill (Purple Accent instead of Lime Green) */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: 12,
            paddingVertical: 7,
            borderRadius: 10,
            backgroundColor: colors.brand,
          }}
        >
          <Icon name="play-outline" size={14} color="#FFFFFF" />
          <Text style={[typography.caption, { color: '#FFFFFF', fontWeight: '700' }]}>Entry Trigger</Text>
        </View>
        <View
          style={{
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 8,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
          }}
        >
          <Icon name="git-branch-outline" size={12} color={colors.brandLight} />
          <Text style={[typography.caption, { color: colors.textSecondary }]}>
            {definition.target.owner}/{definition.target.repo}
            {definition.target.number ? `#${definition.target.number}` : ''}
          </Text>
        </View>
      </View>

      {/* Staggered Visual Nodes with Curved Dashed Connectors & Branch Condition Pills */}
      {definition.steps.map((step, index) => {
        const meta = AGENT_STEP_META[step.kind];
        const branch = BRANCH_LABELS[step.kind];
        const badge = NODE_AGENT_BADGE[step.kind];
        const isStaggeredRight = index % 2 === 1;
        const isSelected = selectedStepIndex === index;
        const branchBg =
          branch.tone === 'green'
            ? colors.riskLowBg
            : branch.tone === 'rose'
              ? colors.riskHighBg
              : colors.brandSubtle;
        const branchColor =
          branch.tone === 'green'
            ? colors.riskLow
            : branch.tone === 'rose'
              ? colors.riskHigh
              : colors.brandLight;

        return (
          <View key={step.id}>
            {/* Curved Dashed Connector + Condition Pill */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginLeft: isStaggeredRight ? 28 : 18,
                minHeight: 34,
              }}
            >
              <View
                style={{
                  width: isStaggeredRight ? 26 : 16,
                  height: 30,
                  borderLeftWidth: 1.5,
                  borderBottomWidth: isStaggeredRight ? 1.5 : 0,
                  borderStyle: 'dashed',
                  borderColor: branchColor,
                  borderBottomLeftRadius: isStaggeredRight ? 12 : 0,
                }}
              />
              <View
                style={{
                  marginLeft: 6,
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                  borderRadius: 999,
                  backgroundColor: branchBg,
                  borderWidth: 1,
                  borderColor: branchColor,
                }}
              >
                <Text style={[typography.caption, { color: branchColor, fontSize: 10, fontWeight: '600' }]}>
                  {branch.label}
                </Text>
              </View>
            </View>

            {/* Mexas Node Card */}
            <View
              style={{
                marginLeft: isStaggeredRight ? 24 : 0,
                backgroundColor: colors.surface,
                borderColor: isSelected ? colors.brandLight : step.enabled ? colors.brandMuted : colors.border,
                borderWidth: isSelected ? 1.5 : 1,
                borderRadius: 14,
                padding: 12,
                gap: 8,
                opacity: step.enabled ? 1 : 0.65,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Configure ${step.title}`}
                  disabled={busy}
                  onPress={() => onSelectStep(index)}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      backgroundColor: colors.surfaceElevated,
                      borderWidth: 1,
                      borderColor: colors.border,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon name={meta.icon as IconName} size={17} color={colors.brandLight} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[typography.subhead, { color: colors.text, fontWeight: '700' }]} numberOfLines={1}>
                      {step.title}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
                      <Icon name={badge.icon} size={11} color={colors.brandLight} />
                      <Text style={[typography.caption, { color: colors.brandLight, fontWeight: '600', fontSize: 10 }]}>
                        {badge.label}
                      </Text>
                      <Text style={[typography.caption, { color: colors.textSecondary, fontSize: 10 }]} numberOfLines={1}>
                        · {meta.detail}
                      </Text>
                    </View>
                  </View>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Inspect ${step.title} settings`}
                  disabled={busy}
                  onPress={() => onSelectStep(index)}
                  style={{
                    width: 44,
                    minHeight: 44,
                    borderRadius: 10,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name="ellipsis-horizontal" size={16} color={colors.textSecondary} />
                </Pressable>
              </View>

              {/* Accessible Inline Node Controls (Enable Checkbox + Up/Down Reorder) */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingTop: 6,
                  borderTopWidth: 1,
                  borderTopColor: colors.border,
                }}
              >
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityLabel={`Enable ${step.title}`}
                  accessibilityState={{ checked: step.enabled, disabled: busy }}
                  aria-checked={step.enabled}
                  disabled={busy}
                  onPress={() => onChangeDefinition(toggleAgentStep(definition, step.id))}
                  style={{
                    minHeight: 44,
                    paddingHorizontal: 8,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Icon name={step.enabled ? 'checkbox' : 'square-outline'} size={18} color={colors.brandLight} />
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>
                    {step.enabled ? 'Enabled' : 'Disabled'}
                  </Text>
                </Pressable>

                <View style={{ flex: 1 }} />

                {([-1, 1] as const).map((direction) => {
                  const canMove = Boolean(moveAgentStep(definition, index, direction));
                  return (
                    <Pressable
                      key={direction}
                      accessibilityRole="button"
                      accessibilityLabel={`Move ${step.title} ${direction === -1 ? 'up' : 'down'}`}
                      disabled={busy || !canMove}
                      onPress={() => onChangeDefinition(moveAgentStep(definition, index, direction))}
                      style={{
                        width: 44,
                        minHeight: 44,
                        borderRadius: 8,
                        justifyContent: 'center',
                        alignItems: 'center',
                        opacity: busy || !canMove ? 0.35 : 1,
                      }}
                    >
                      <Icon
                        name={direction === -1 ? 'arrow-up-outline' : 'arrow-down-outline'}
                        size={16}
                        color={colors.brandLight}
                      />
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        );
      })}

      {/* Terminal Connector Dot at Bottom of Graph */}
      <View style={{ alignItems: 'center', marginTop: 6 }}>
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: colors.brandSubtle,
            borderWidth: 1,
            borderColor: colors.brandMuted,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="checkmark-outline" size={14} color={colors.brandLight} />
        </View>
      </View>
    </View>
  );
}
