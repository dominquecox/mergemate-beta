import React from 'react';
import { Linking, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Card, Lock, Project } from '@mergemate/contracts';
import type { ApiClient } from '../api/client';
import { approveRunPath, draftPrUrl, primaryAction, runIdFromBranch, runSummary, safeHttpsUrl, useAgentRun } from './agentRun';
import { useTheme } from '../context/ThemeContext';
import { useBrainStyles } from './screens';
import { CopyDetailsButton } from '../components/CopyDetailsButton';

export interface AgentPanelProps {
  api: ApiClient;
  project: Project;
  card: Card;
  lock: Lock | null;
  onChanged: () => void;
}

/** Bottom of the card detail: one primary button and the "Agent run" block. Nothing here merges or approves on GitHub. */
export function AgentPanel({ api, project, card, lock, onChanged }: AgentPanelProps) {
  const styles = useBrainStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const agent = useAgentRun({ api, project, card, onChanged });
  const action = primaryAction(card, lock);
  const { run, watch } = agent;

  const prNumber = watch?.state === 'pr' ? watch.prNumber : run?.status === 'pr_opened' ? run.prNumber : undefined;
  const prLink = (run?.status === 'pr_opened' ? safeHttpsUrl(run.prUrl) : null) ?? (prNumber ? draftPrUrl(project, prNumber) : null);
  const [approveError, setApproveError] = React.useState<string | null>(null);
  // The run id comes from this screen's run, or else from the card's agent branch, so a reload keeps the way to approve.
  const runId = run?.runId ?? runIdFromBranch(watch?.card.branch ?? card.branch);
  const approve = () => {
    if (!runId) {
      setApproveError('This run could not be found. Open it from Recent runs on the Workflows page.');
      return;
    }
    setApproveError(null);
    router.push(approveRunPath(runId));
  };
  const summary = runSummary({
    planning: agent.planning,
    run,
    watchBranch: watch?.card.branch,
    prNumber,
    prLink,
    // A card the agent is still working, with no run on this screen (for example after a reload).
    resumableBranch: !run && card.status === 'active' && !card.prNumber && runIdFromBranch(card.branch) !== null ? card.branch ?? null : null,
  });
  const onPrimary = () => {
    if (!summary?.primary) return;
    if (summary.primary.kind === 'approve') approve();
    else if (summary.primary.kind === 'open_pr' && prLink) void Linking.openURL(prLink);
    else if (summary.primary.kind === 'retry') void agent.retry();
  };
  const tone = summary?.tone === 'good' ? colors.statusGood : summary?.tone === 'bad' ? colors.statusAlert : colors.brandLight;

  return (
    <View style={styles.section}>
      {action && !summary?.primary ? (
        <TouchableOpacity
          style={[styles.retryButton, { minHeight: 44, justifyContent: 'center', alignItems: 'center' }]}
          onPress={() => void (action === 'proceed' ? agent.proceed() : agent.plan())}
          disabled={agent.busy}
          accessibilityRole="button"
          accessibilityLabel={action === 'proceed' ? 'Proceed' : 'Plan with agent'}
          accessibilityState={{ disabled: agent.busy, busy: agent.busy }}
        >
          <Text style={styles.retryText}>{agent.busy ? 'Working' : action === 'proceed' ? 'Proceed' : 'Plan with agent'}</Text>
        </TouchableOpacity>
      ) : null}

      {agent.lockedId && !lock ? <Text style={styles.text}>Locked{agent.lockedTitle ? ` "${agent.lockedTitle}"` : ''}. Open that card to plan with the agent.</Text> : null}
      {agent.error ? (
        <>
          <Text style={styles.errorText} accessibilityRole="alert">{agent.error}</Text>
          <CopyDetailsButton report={{ at: new Date(), ...(agent.errorInfo ?? {}), message: agent.error, runId: runId ?? undefined }} />
        </>
      ) : null}

      {approveError ? <Text style={styles.errorText} accessibilityRole="alert">{approveError}</Text> : null}

      {summary ? (
        <View accessibilityLiveRegion="polite" style={{ gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
          <Text style={styles.sectionLabel}>Agent run</Text>
          <Text accessibilityRole="header" style={{ fontSize: 17, fontWeight: '600', color: tone }}>{summary.heading}</Text>
          <Text style={styles.text}>{summary.summary}</Text>
          {summary.files.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }} accessibilityLabel={`${summary.files.length} files`}>
              {summary.files.map((file) => (
                <View key={file} style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceElevated, maxWidth: '100%' }}>
                  <Text numberOfLines={1} style={{ fontSize: 11, color: colors.textSecondary }}>{file}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {summary.branch ? <Text selectable numberOfLines={1} style={{ fontSize: 11, color: colors.textMuted }}>Branch {summary.branch}</Text> : null}
          {summary.primary ? (
            <TouchableOpacity
              style={[styles.retryButton, { minHeight: 44, justifyContent: 'center', alignItems: 'center' }]}
              onPress={onPrimary}
              disabled={summary.primary.kind === 'retry' && agent.busy}
              accessibilityRole={summary.primary.kind === 'open_pr' ? 'link' : 'button'}
              accessibilityLabel={summary.primary.kind === 'open_pr' && prNumber ? `Open draft PR ${prNumber}` : summary.primary.label}
            >
              <Text style={styles.retryText}>{summary.primary.label}</Text>
            </TouchableOpacity>
          ) : null}
          {run?.status === 'failed' ? (
            <CopyDetailsButton report={{ code: 'run_failed', message: run.message ?? run.summary, runId: run.runId, step: 'Plan with agent', at: new Date() }} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
