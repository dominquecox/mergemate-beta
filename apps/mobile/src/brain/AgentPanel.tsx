import React from 'react';
import { Linking, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Card, Lock, Project } from '@mergemate/contracts';
import type { ApiClient } from '../api/client';
import { approveRunPath, draftPrUrl, primaryAction, safeHttpsUrl, useAgentRun } from './agentRun';
import { useBrainStyles } from './screens';

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
  const approve = () => run?.runId && router.push(approveRunPath(run.runId));

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
      {agent.error ? <Text style={styles.errorText} accessibilityRole="alert">{agent.error}</Text> : null}

      {run ? (
        <View accessibilityLiveRegion="polite">
          <Text style={styles.sectionLabel}>Agent run</Text>
          {run.status === 'running' && watch?.state !== 'pr' ? (
            <>
              <Text style={styles.text}>{watch?.state === 'timeout' ? 'Waiting for your approval. Open the run to approve the patch.' : 'The agent prepared a patch. Review it and approve it with a passkey to open a draft PR.'}</Text>
              {run.summary ? <Text style={styles.text}>{run.summary}</Text> : null}
              {run.files.length ? <Text style={styles.text}>Files: {run.files.join(', ')}</Text> : null}
              {watch?.card.branch ?? run.branch ? <Text style={styles.text}>Branch: {watch?.card.branch ?? run.branch}</Text> : null}
              {run.runId ? (
                <TouchableOpacity style={styles.iconButton} onPress={approve} accessibilityRole="button" accessibilityLabel="Approve the patch">
                  <Text style={styles.iconButtonText}>Approve the patch</Text>
                </TouchableOpacity>
              ) : null}
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
