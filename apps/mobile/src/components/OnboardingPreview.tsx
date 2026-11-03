import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from './Text';
import { Icon, type IconName } from './Icon';
import { useTheme } from '../context/ThemeContext';
import { ExperienceSurface } from './ExperienceDesign';

/** Illustrative workspace previews, explicitly labeled and never presented as executed agent runs. */
export function OnboardingPreview({ step }: { step: number }) {
  const { colors, typography } = useTheme();
  const nodes: { icon: IconName; title: string; detail: string; branch: string }[] = step === 1 ? [
    { icon: 'git-pull-request-outline', title: 'Fetch PR Context', detail: 'Pin commit head SHA & changed files', branch: 'Entry Trigger' },
    { icon: 'sparkles-outline', title: 'AI Risk & Review Plan', detail: 'Secret-redacted blast radius & summary', branch: 'Context Pinned' },
    { icon: 'checkmark-done-outline', title: 'QA Evidence & Route', detail: 'Verified check evidence & reviewer routing', branch: 'Plan Ready' },
  ] : step === 2 ? [
    { icon: 'folder-open-outline', title: 'Scoped Repositories', detail: 'Only the GitHub repos you select', branch: 'Repo Scope' },
    { icon: 'options-outline', title: 'Consent & Guardrails', detail: 'Explicit AI consent & secret stripping', branch: 'Redacted Input' },
    { icon: 'finger-print-outline', title: 'Audited Outcomes', detail: 'Draft PRs only when you run a fix workflow', branch: 'Verified Output' },
  ] : [
    { icon: 'git-network-outline', title: 'Visual Workflow Studio', detail: 'Prompt to editable node graph in seconds', branch: 'Entry Prompt' },
    { icon: 'scan-outline', title: 'Executive Inbox & Triage', detail: 'Ranked by risk, provenance & urgency', branch: 'Needs You' },
    { icon: 'arrow-forward-outline', title: 'Bento Desktop & Mobile', detail: 'High-density command view on every screen', branch: 'Ship Faster' },
  ];

  return (
    <ExperienceSurface accent style={{ padding: 14 }}>
      <View style={styles.headerRow}>
        <View style={[styles.entryTriggerPill, { backgroundColor: colors.brand }]}>
          <Icon name="play" size={10} color="#FFFFFF" />
          <Text style={[typography.caption, { color: '#FFFFFF', fontWeight: '700', fontSize: 10 }]}>
            Entry Trigger
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Icon name="sparkles-outline" size={13} color={colors.brandLight} />
          <Text style={[typography.code, { color: colors.brandLight, fontSize: 10, letterSpacing: 0.8 }]}>
            WORKFLOW GRAPH · ILLUSTRATION
          </Text>
        </View>
      </View>

      {nodes.map((node, index) => (
        <React.Fragment key={node.title}>
          {index > 0 && (
            <View style={styles.connectorRow}>
              <View style={[styles.dashedLine, { borderColor: colors.brandLight }]} />
              <View style={[styles.branchBadge, { backgroundColor: colors.brandSubtle, borderColor: colors.brandMuted }]}>
                <Text style={[typography.code, { color: colors.brandLight, fontSize: 9 }]}>{node.branch}</Text>
              </View>
            </View>
          )}
          <View
            style={[
              styles.nodeCard,
              {
                backgroundColor: colors.surface,
                borderColor: index === 0 ? colors.brandLight : colors.border,
                marginLeft: index === 1 ? 14 : 0,
              },
            ]}
          >
            <View style={[styles.iconBox, { backgroundColor: colors.surfaceElevated }]}>
              <Icon name={node.icon} size={16} color={colors.brandLight} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[typography.subhead, { color: colors.text, fontWeight: '700' }]}>{node.title}</Text>
              <Text style={[typography.caption, { color: colors.textSecondary, fontSize: 11 }]}>{node.detail}</Text>
            </View>
            <Icon name="ellipsis-horizontal" size={14} color={colors.textMuted} />
          </View>
        </React.Fragment>
      ))}
    </ExperienceSurface>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 10,
  },
  entryTriggerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999,
  },
  connectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 20,
    paddingVertical: 3,
  },
  dashedLine: {
    height: 14,
    borderLeftWidth: 1.5,
    borderStyle: 'dashed',
  },
  branchBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 9999,
    borderWidth: 1,
  },
  nodeCard: {
    padding: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
  },
  iconBox: {
    height: 34,
    width: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
