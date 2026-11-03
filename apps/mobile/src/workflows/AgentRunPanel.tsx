import React, { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import type { WorkflowRun } from '@mergemate/contracts';
import { Text } from '../components/Text';
import { Icon, type IconName } from '../components/Icon';
import { Button } from '../components/Button';
import { useTheme } from '../context/ThemeContext';
import { AGENT_STEP_META, displayRunStatus, evidenceText, isRunActive, safeDraftPrLink } from './agent-model';

export function AgentRunPanel({ run, cancelling, onCancel, onRetry }: { run: WorkflowRun; cancelling: boolean; onCancel: () => void; onRetry: () => void }) {
  const { colors, typography } = useTheme();
  const [expanded, setExpanded] = useState<string[]>([]);
  const complete = run.steps.filter(step => step.status === 'succeeded' || step.status === 'skipped').length;
  const statusColor = run.status === 'succeeded' ? colors.riskLow : run.status === 'failed' ? colors.riskHigh : colors.brandLight;
  return <View style={{ gap: 14 }}>
    <View style={{ padding: 20, backgroundColor: colors.brandSubtle, borderColor: colors.brandMuted, borderWidth: 1, borderRadius: 22, gap: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <Text style={[typography.caption, { color: colors.brandLight }]}>EXECUTION RECEIPT</Text>
        <Text accessibilityLiveRegion="polite" style={[typography.subhead, { color: statusColor, fontWeight: '700' }]}>{displayRunStatus(run.status)}</Text>
      </View>
      <Text accessibilityRole="header" style={[typography.title2, { color: colors.text }]}>{run.definition.name}</Text>
      <Text style={[typography.footnote, { color: colors.textSecondary }]}>{complete} of {run.steps.length} steps finished · {run.definition.target.owner}/{run.definition.target.repo}</Text>
      <Text selectable style={[typography.code, { color: colors.textSecondary, fontSize: 11 }]}>Commit {run.headSha}</Text>
      <Text selectable style={[typography.caption, { color: colors.textSecondary }]}>Run {run.id}</Text>
      {!!run.error && <Text accessibilityRole="alert" style={[typography.footnote, { color: colors.riskHigh }]}>{run.error}</Text>}
      {isRunActive(run.status) ? <Button title="Cancel run" variant="secondary" loading={cancelling} onPress={onCancel} /> : ['failed','blocked','cancelled'].includes(run.status) ? <Button title="Review and retry workflow" variant="secondary" onPress={onRetry} /> : null}
    </View>
    {run.steps.map((step, index) => {
      const open = expanded.includes(step.id);
      const meta = AGENT_STEP_META[step.kind];
      const draftLink = safeDraftPrLink(step.evidence?.draftPrUrl, run.definition.target);
      const hasDetails = !!(step.output || step.error || step.evidence);
      return <View key={step.id}>
        {index > 0 && <View style={{ marginLeft: 40, height: 18, borderLeftWidth: 1, borderStyle: 'dashed', borderColor: colors.brandMuted }} />}
        <View style={{ borderRadius: 18, borderWidth: 1, borderColor: step.status === 'running' ? colors.brandLight : colors.border, backgroundColor: colors.surface, padding: 16, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceElevated }}>
              <Icon name={(step.status === 'succeeded' ? 'checkmark-outline' : step.status === 'failed' ? 'alert-outline' : meta.icon) as IconName} size={20} color={step.status === 'failed' ? colors.riskHigh : colors.brandLight} />
            </View>
            <View style={{ flex: 1 }}><Text style={[typography.subhead, { color: colors.text, fontWeight: '700' }]}>{step.title}</Text><Text style={[typography.caption, { color: colors.textSecondary, marginTop: 4 }]}>{displayRunStatus(step.status)}</Text></View>
            {hasDetails && <Pressable accessibilityRole="button" accessibilityLabel={`${open ? 'Hide' : 'Inspect'} ${step.title} result`} accessibilityState={{ expanded: open }} onPress={() => setExpanded(old => old.includes(step.id) ? old.filter(id => id !== step.id) : [...old, step.id])} style={{ width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} /></Pressable>}
          </View>
          {!!step.error && <Text accessibilityRole="alert" style={[typography.footnote, { color: colors.riskHigh }]}>{step.error}</Text>}
          {open && <View style={{ gap: 10 }}>
            {!!step.output && <Text selectable style={[typography.footnote, { color: colors.textSecondary }]}>{evidenceText(step.output)}</Text>}
            {!!step.evidence && <View style={{ backgroundColor: colors.surfaceElevated, borderRadius: 12, padding: 12, gap: 8 }}><Text style={[typography.caption, { color: colors.brandLight }]}>Evidence reported by the runtime</Text><Text selectable style={[typography.code, { color: colors.textSecondary, fontSize: 11 }]}>{evidenceText(step.evidence)}</Text></View>}
          </View>}
          {draftLink && <Button title="Open generated draft PR" variant="secondary" onPress={() => Linking.openURL(draftLink)} />}
        </View>
      </View>;
    })}
    <Text style={[typography.caption, { color: colors.textSecondary }]}>Results come from the configured backend and executor. Existing GitHub checks and newly executed tests are separate evidence. A completed run never merges a PR.</Text>
  </View>;
}
