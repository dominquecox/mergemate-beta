import React from 'react';
import { View, Pressable, TextInput } from 'react-native';
import type { WorkflowDefinition } from '@mergemate/contracts';
import { Text } from '../components/Text';
import { Icon, type IconName } from '../components/Icon';
import { useTheme } from '../context/ThemeContext';
import { AGENT_STEP_META, moveAgentStep, toggleAgentStep } from './agent-model';

const STEP_GUARDRAILS: Record<string, { scope: string; output: string }> = {
  context: {
    scope: 'Reads repository metadata, base branch and pinned HEAD commit SHA via authenticated GitHub API.',
    output: 'Immutable target snapshot with file paths and diff coverage bounds.',
  },
  checks: {
    scope: 'Inspects existing GitHub check-runs and commit statuses reported on the pinned SHA.',
    output: 'Recorded check verdict (never claims new tests were executed).',
  },
  risk: {
    scope: 'Scans secret-redacted diff hunks + rule signals (auth, billing, migrations, test coverage).',
    output: 'Validated risk level (low/medium/high) with grounded reasons.',
  },
  summary: {
    scope: 'Processes redacted PR diff and description within the model context window.',
    output: 'Structured whatChanged, whyItMatters and suggestedFocus list.',
  },
  review_plan: {
    scope: 'Evaluates changed file graph and risk signals to order reviewer attention.',
    output: 'Step-by-step file reading order and verification checklist.',
  },
  patch: {
    scope: 'Generates minimal code changes restricted to allowlisted existing repository files.',
    output: 'Bounded file patch queued for the isolated Docker executor.',
  },
  qa: {
    scope: 'Executes repository test suite inside an ephemeral isolated container with no secrets.',
    output: 'Real command exit codes, duration and test output hash.',
  },
  draft_pr: {
    scope: 'Pushes verified branch and opens a GitHub Draft PR only after QA tests pass.',
    output: 'Draft Pull Request URL and commit receipt (never auto-merges).',
  },
  route: {
    scope: 'Packages all preceding step receipts into a final reviewer handoff.',
    output: 'Direct GitHub destination link and recommended next decision.',
  },
};

export function WorkflowNodeInspector({
  definition,
  stepIndex,
  busy,
  onChangeDefinition,
  onClose,
}: {
  definition: WorkflowDefinition;
  stepIndex: number;
  busy: boolean;
  onChangeDefinition: (next: WorkflowDefinition | null) => void;
  onClose: () => void;
}) {
  const { colors, typography } = useTheme();
  const step = definition.steps[stepIndex];
  if (!step) return null;

  const meta = AGENT_STEP_META[step.kind];
  const guardrail = STEP_GUARDRAILS[step.kind] ?? {
    scope: meta.detail,
    output: 'Structured JSON step receipt.',
  };

  const updateStepTitle = (title: string) => {
    const nextSteps = definition.steps.map((item, idx) =>
      idx === stepIndex ? { ...item, title } : item,
    );
    onChangeDefinition({ ...definition, steps: nextSteps });
  };

  const canMoveUp = Boolean(moveAgentStep(definition, stepIndex, -1));
  const canMoveDown = Boolean(moveAgentStep(definition, stepIndex, 1));

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.brandMuted,
        borderWidth: 1,
        borderRadius: 16,
        padding: 14,
        gap: 12,
      }}
    >
      {/* Top Mexas Drawer Header: Back + Title + Save Pill */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close step inspector"
          onPress={onClose}
          style={{
            minWidth: 44,
            minHeight: 44,
            borderRadius: 10,
            backgroundColor: colors.surfaceElevated,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="arrow-back" size={16} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[typography.subhead, { color: colors.text, fontWeight: '700' }]}>Build Workflow</Text>
          <Text style={[typography.caption, { color: colors.brandLight }]}>
            Node {stepIndex + 1} of {definition.steps.length} · {step.kind.toUpperCase()}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Save node configuration"
          onPress={onClose}
          style={({ pressed }) => ({
            minHeight: 44,
            paddingHorizontal: 14,
            borderRadius: 10,
            backgroundColor: colors.brand,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text style={[typography.caption, { color: '#FFFFFF', fontWeight: '700' }]}>Done</Text>
        </Pressable>
      </View>

      {/* Node Header Title */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: 11,
              backgroundColor: colors.brandSubtle,
              borderWidth: 1,
              borderColor: colors.brandMuted,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name={meta.icon as IconName} size={18} color={colors.brandLight} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[typography.headline, { color: colors.text }]}>{step.title}</Text>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>{meta.detail}</Text>
          </View>
        </View>
      </View>

      {/* Editable Step Title */}
      <View style={{ gap: 4 }}>
        <Text style={[typography.caption, { color: colors.textSecondary, fontWeight: '600' }]}>Node Title</Text>
        <TextInput
          accessibilityLabel={`Edit ${step.kind} step title`}
          value={step.title}
          editable={!busy}
          maxLength={80}
          onChangeText={updateStepTitle}
          style={[
            typography.footnote,
            {
              minHeight: 44,
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.borderLight,
              backgroundColor: colors.surfaceElevated,
              color: colors.text,
            },
          ]}
        />
      </View>

      {/* Mexas-style Response / Execution Variants */}
      <View style={{ gap: 8 }}>
        <Text style={[typography.caption, { color: colors.textSecondary, fontWeight: '600' }]}>
          Execution Specification
        </Text>
        <View
          style={{
            backgroundColor: colors.surfaceElevated,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: colors.border,
            padding: 10,
            gap: 4,
          }}
        >
          <Text style={[typography.caption, { color: colors.brandLight, fontWeight: '600' }]}>
            Input Data & Redaction Scope
          </Text>
          <Text style={[typography.caption, { color: colors.textSecondary }]}>{guardrail.scope}</Text>
        </View>
        <View
          style={{
            backgroundColor: colors.surfaceElevated,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: colors.border,
            padding: 10,
            gap: 4,
          }}
        >
          <Text style={[typography.caption, { color: colors.brandLight, fontWeight: '600' }]}>
            Expected Evidence Output
          </Text>
          <Text style={[typography.caption, { color: colors.textSecondary }]}>{guardrail.output}</Text>
        </View>
      </View>

      {/* Bottom 4-up Mexas Node Action Strip */}
      <View
        style={{
          flexDirection: 'row',
          gap: 8,
          paddingTop: 6,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Toggle ${step.title} in inspector`}
          disabled={busy}
          onPress={() => onChangeDefinition(toggleAgentStep(definition, step.id))}
          style={{
            flex: 1,
            minHeight: 54,
            borderRadius: 10,
            backgroundColor: colors.surfaceElevated,
            borderWidth: 1,
            borderColor: step.enabled ? colors.brandMuted : colors.border,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 3,
          }}
        >
          <Icon name={step.enabled ? 'checkbox' : 'square-outline'} size={16} color={colors.brandLight} />
          <Text style={[typography.caption, { color: colors.textSecondary, fontSize: 10 }]}>
            {step.enabled ? 'Enabled' : 'Disabled'}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Move ${step.title} earlier`}
          disabled={busy || !canMoveUp}
          onPress={() => onChangeDefinition(moveAgentStep(definition, stepIndex, -1))}
          style={{
            flex: 1,
            minHeight: 54,
            borderRadius: 10,
            backgroundColor: colors.surfaceElevated,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 3,
            opacity: busy || !canMoveUp ? 0.4 : 1,
          }}
        >
          <Icon name="arrow-up-outline" size={16} color={colors.brandLight} />
          <Text style={[typography.caption, { color: colors.textSecondary, fontSize: 10 }]}>Move Up</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Move ${step.title} later`}
          disabled={busy || !canMoveDown}
          onPress={() => onChangeDefinition(moveAgentStep(definition, stepIndex, 1))}
          style={{
            flex: 1,
            minHeight: 54,
            borderRadius: 10,
            backgroundColor: colors.surfaceElevated,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 3,
            opacity: busy || !canMoveDown ? 0.4 : 1,
          }}
        >
          <Icon name="arrow-down-outline" size={16} color={colors.brandLight} />
          <Text style={[typography.caption, { color: colors.textSecondary, fontSize: 10 }]}>Move Down</Text>
        </Pressable>

        <View
          style={{
            flex: 1,
            minHeight: 54,
            borderRadius: 10,
            backgroundColor: colors.surfaceElevated,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 3,
          }}
        >
          <Icon name="shield-checkmark-outline" size={16} color={colors.riskLow} />
          <Text style={[typography.caption, { color: colors.textSecondary, fontSize: 10 }]}>Guarded</Text>
        </View>
      </View>
    </View>
  );
}
