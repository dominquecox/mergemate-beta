import React from 'react';
import { Linking, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import type { Card, Lock, Project } from '@mergemate/contracts';
import type { ApiClient } from '../api/client';
import { approveRunPath, cardAgentState, draftPrUrl, runIdFromBranch, safeHttpsUrl, useAgentRun } from './agentRun';
import { useCardRunStatus } from './useCardRunStatus';
import { useTheme } from '../context/ThemeContext';
import { useBrainStyles } from './screens';
import { CopyDetailsButton } from '../components/CopyDetailsButton';
import { agentErrorCopy } from './agentErrors';

export interface AgentPanelProps {
  api: ApiClient;
  project: Project;
  card: Card;
  lock: Lock | null;
  onChanged: () => void;
  /** Closes whatever hosts this panel (the card detail Modal) before navigating away, so the next screen is visible. */
  onLeave?: () => void;
}

/** Bottom of the card detail: one primary button and the "Agent run" block. Nothing here merges or approves on GitHub. */
export function AgentPanel({ api, project, card, lock, onChanged, onLeave }: AgentPanelProps) {
  const styles = useBrainStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const agent = useAgentRun({ api, project, card, onChanged });
  const { run, watch } = agent;

  const prNumber = watch?.state === 'pr' ? watch.prNumber : run?.status === 'pr_opened' ? run.prNumber : undefined;
  const prLink = (run?.status === 'pr_opened' ? safeHttpsUrl(run.prUrl) : null) ?? (prNumber ? draftPrUrl(project, prNumber) : null);
  const [approveError, setApproveError] = React.useState<string | null>(null);
  // One tap opens the run: further taps are ignored until this screen is focused again.
  const [leaving, setLeaving] = React.useState(false);
  const leavingRef = React.useRef(false);
  useFocusEffect(React.useCallback(() => { leavingRef.current = false; setLeaving(false); }, []));
  // The run id comes from this screen's run, or else from the card's agent branch, so a reload keeps the way to approve.
  const runId = run?.runId ?? runIdFromBranch(watch?.card.branch ?? card.branch);
  const approve = () => {
    if (!runId) {
      setApproveError('This run could not be found. Open it from Recent runs on the Workflows page.');
      return;
    }
    if (leavingRef.current) return;
    leavingRef.current = true;
    setLeaving(true);
    setApproveError(null);
    onLeave?.();
    router.push(approveRunPath(runId, project.id));
  };
  const branchRunId = !run && !card.prNumber ? runIdFromBranch(card.branch) : null;
  const branchRun = useCardRunStatus(branchRunId, card.updatedAt);
  const state = cardAgentState({
    cardStatus: card.status,
    locked: !!lock,
    busy: agent.locking ? 'locking' : agent.planning ? 'planning' : null,
    run,
    prNumber,
    prLink,
    branchRun,
  });
  const onPrimary = () => {
    if (agent.busy || leaving) return;
    if (state.action === 'approve') approve();
    else if (state.action === 'open_pr' && prLink) void Linking.openURL(prLink);
    else if (state.action === 'proceed') void agent.proceed();
    else if (state.action === 'plan') void agent.plan();
    else if (state.action === 'proceed_plan') void agent.proceedThenPlan();
  };
  const dot = state.tone === 'good' ? colors.statusGood : state.tone === 'bad' ? colors.statusAlert : state.tone === 'info' ? colors.brandLight : colors.textMuted;
  const working = agent.busy || leaving;
  const label = leaving ? 'Opening the run…' : state.label;
  const files = run?.status === 'running' ? run.files : [];

  return (
    <View accessibilityLiveRegion="polite" style={{ gap: 10, padding: 14, borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: dot }} />
        <Text style={[styles.sectionLabel, { marginBottom: 0 }]}>Agent</Text>
      </View>
      <Text style={styles.text}>{state.line}</Text>
      {files.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }} accessibilityLabel={`${files.length} files`}>
          {files.map((file) => (
            <View key={file} style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceElevated, maxWidth: '100%' }}>
              <Text numberOfLines={1} style={{ fontSize: 11, color: colors.textSecondary }}>{file}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {agent.lockedId && agent.lockedId !== card.id ? <Text style={styles.text}>Locked{agent.lockedTitle ? ` "${agent.lockedTitle}"` : ''} instead. Open that card to plan with the agent.</Text> : null}
      {agent.error ? (
        <>
          <Text style={styles.errorText} accessibilityRole="alert">{agentErrorCopy(agent.error, agent.errorInfo?.code).message}</Text>
          <CopyDetailsButton report={{ at: new Date(), ...(agent.errorInfo ?? {}), message: agent.error, runId: runId ?? undefined }} />
        </>
      ) : null}
      {approveError ? <Text style={styles.errorText} accessibilityRole="alert">{approveError}</Text> : null}
      {state.label && (state.action || working) ? (
        <TouchableOpacity
          style={[styles.retryButton, { minHeight: 48, justifyContent: 'center', alignItems: 'center', opacity: working || !state.action ? 0.7 : 1 }]}
          onPress={onPrimary}
          disabled={working || !state.action}
          accessibilityRole={state.action === 'open_pr' ? 'link' : 'button'}
          accessibilityLabel={label}
          accessibilityState={{ disabled: working || !state.action, busy: working }}
        >
          <Text style={styles.retryText}>{label}</Text>
        </TouchableOpacity>
      ) : null}
      {state.subline && !working ? <Text style={{ fontSize: 12, color: colors.textMuted, textAlign: 'center' }}>{state.subline}</Text> : null}
      {branchRunId && (branchRun.state === 'stopped' || branchRun.state === 'failed') && !working ? (
        <TouchableOpacity onPress={approve} accessibilityRole="link" accessibilityLabel="View the stopped run" style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ fontSize: 14, color: colors.brandLight }}>View stopped run</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
