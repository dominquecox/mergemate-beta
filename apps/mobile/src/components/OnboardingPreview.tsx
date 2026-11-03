import React from 'react';
import { View } from 'react-native';
import { Text } from './Text';
import { Icon, type IconName } from './Icon';
import { useTheme } from '../context/ThemeContext';
import { ExperienceSurface } from './ExperienceDesign';

/** Illustrative workspace previews, explicitly labeled and never presented as executed agent runs. */
export function OnboardingPreview({ step }: { step: number }) {
  const { colors, typography } = useTheme();
  const nodes: { icon: IconName; title: string; detail: string }[] = step === 1 ? [
    { icon: 'git-pull-request-outline', title: 'A change comes in', detail: 'Pull request context' },
    { icon: 'sparkles-outline', title: 'Build the review plan', detail: 'Evidence, risk and verification' },
    { icon: 'checkmark-done-outline', title: 'Inspect the outcome', detail: 'Clear findings. Your next decision.' },
  ] : step === 2 ? [
    { icon: 'folder-open-outline', title: 'Your repositories', detail: 'The connections you choose' },
    { icon: 'options-outline', title: 'Your AI preferences', detail: 'Explicit consent and visible controls' },
    { icon: 'finger-print-outline', title: 'Your next move', detail: 'Review outcomes before taking action' },
  ] : [
    { icon: 'git-network-outline', title: 'One review workspace', detail: 'Inbox, workflows and evidence' },
    { icon: 'scan-outline', title: 'Understand the change', detail: 'Context without the noise' },
    { icon: 'arrow-forward-outline', title: 'Keep work moving', detail: 'From incoming PR to the next step' },
  ];
  return <ExperienceSurface accent style={{ padding: 18 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Icon name="sparkles-outline" size={15} color={colors.brandLight} /><Text style={[typography.code, { color: colors.brandLight, fontSize: 10, letterSpacing: 1 }]}>WORKSPACE PREVIEW</Text></View>
      <Text style={[typography.caption, { color: colors.textSecondary, fontSize: 10 }]}>Illustration</Text>
    </View>
    {nodes.map((node, index) => <React.Fragment key={node.title}>
      {index > 0 && <View style={{ height: 12, marginLeft: 22, borderLeftWidth: 1, borderStyle: 'dashed', borderColor: colors.brandLight }} />}
      <View style={{ padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16 }}>
        <View style={{ height: 38, width: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceElevated }}><Icon name={node.icon} size={19} color={colors.brandLight} /></View>
        <View style={{ flex: 1, gap: 4 }}><Text style={[typography.subhead, { color: colors.text, fontWeight: '600' }]}>{node.title}</Text><Text style={[typography.caption, { color: colors.textSecondary, fontSize: 11 }]}>{node.detail}</Text></View>
      </View>
    </React.Fragment>)}
  </ExperienceSurface>;
}
