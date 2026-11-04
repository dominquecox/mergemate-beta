import React from 'react';
import { Linking, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Card, Lock, Project } from '@mergemate/contracts';
import type { ApiClient } from '../api/client';
import { approveRunPath, draftPrUrl, primaryAction, runIdFromBranch, safeHttpsUrl, useAgentRun } from './agentRun';
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
  const approveButton = (
    <TouchableOpacity style={styles.iconButton} onPress={approve} accessibilityRole="button" accessibilityLabel={run ? 'Approve the patch' : 'Open the agent run'}>
      <Text style={styles.iconButtonText}>{run ? 'Approve the patch' : 'Open the agent run'}</Text>
    </TouchableOpacity>
  );
  // A card the agent is still working, with no run on this screen (for example after a reload).
  const resumable = !run && card.status === 'active' && !card.prNumber && runIdFromBranch(card.branch) !== null;

  return (
    <View style={styles.section}>
      {action ? (
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

      {agent.lockedId && !lock ? <Text style={styles.text}>Locked {agent.lockedId}. Open that card to plan with the agent.</Text> : null}
      {agent.error ? (
        <>
          <Text style={styles.errorText} accessibilityRole="alert">{agent.error}</Text>
          <CopyDetailsButton report={{ at: new Date(), ...(agent.errorInfo ?? {}), message: agent.error, runId: runId ?? undefined }} />
        </>
      ) : null}

      {approveError ? <Text style={styles.errorText} accessibilityRole="alert">{approveError}</Text> : null}

      {resumable ? (
        <View accessibilityLiveRegion="polite">
          <Text style={styles.sectionLabel}>Agent run</Text>
          <Text style={styles.text}>This card has an agent run. Open it to see where it stands, and approve the patch there if it is waiting.</Text>
          <Text style={styles.text}>Branch: {card.branch}</Text>
          {approveButton}
        </View>
      ) : null}

      {run ? (
        <View accessibilityLiveRegion="polite">
          <Text style={styles.sectionLabel}>Agent run</Text>
          {run.status === 'running' && watch?.state !== 'pr' ? (
            <>
              <Text style={styles.text}>{watch?.state === 'timeout' ? 'Waiting for your approval. Open the run to approve the patch.' : 'The agent prepared a patch. Review it and approve it with a passkey to open a draft PR.'}</Text>
              {run.summary ? <Text style={styles.text}>{run.summary}</Text> : null}
              {run.files.length ? <Text style={styles.text}>Files: {run.files.join(', ')}</Text> : null}
              {watch?.card.branch ?? run.branch ? <Text style={styles.text}>Branch: {watch?.card.branch ?? run.branch}</Text> : null}
              {approveButton}
            </>
          ) : null}
          {prNumber ? (
            <>
              <Text style={styles.text}>Draft PR #{prNumber}. Merging stays with you on GitHub.</Text>
              {prLink ? (
                <TouchableOpacity style={styles.iconButton} onPress={() => void Linking.openURL(prLink)} accessibilityRole="link" accessibilityLabel={`Open draft PR ${prNumber}`}>
                  <Text style={styles.iconButtonText}>Open PR</Text>
                </TouchableOpacity>
              ) : null}
            </>
          ) : null}
          {run.status === 'no_change' ? <Text style={styles.text}>{run.summary}</Text> : null}
          {run.status === 'failed' ? (
            <>
              <Text style={styles.errorText}>{run.message ?? run.summary}</Text>
              <CopyDetailsButton report={{ code: 'run_failed', message: run.message ?? run.summary, runId: run.runId, step: 'Plan with agent', at: new Date() }} />
              <TouchableOpacity style={styles.iconButton} onPress={() => void agent.retry()} disabled={agent.busy} accessibilityRole="button" accessibilityLabel="Retry">
                <Text style={styles.iconButtonText}>Retry</Text>
              </TouchableOpacity>
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
