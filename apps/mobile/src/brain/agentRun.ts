import { useCallback, useEffect, useRef, useState } from 'react';
import type { BrainRunResponse, Card, Lock, Project } from '@mergemate/contracts';
import type { ApiClient } from '../api/client';
import { agentErrorCopy } from './agentErrors';
import { errorDetailsOf, type ErrorDetails } from '../api/error-details';

export const POLL_INTERVAL_MS = 5000;
export const POLL_LIMIT_MS = 5 * 60 * 1000;

export type PrimaryAction = 'proceed' | 'plan' | null;

/** One primary button: Proceed until the card is locked, then Plan with agent. Closed cards offer neither. */
export function primaryAction(card: Card, lock: Lock | null | undefined): PrimaryAction {
  if (card.status !== 'open' && card.status !== 'active') return null;
  return lock ? 'plan' : 'proceed';
}

/** Only https links are ever opened. */
export function safeHttpsUrl(url: string | undefined): string | null {
  return url && url.startsWith('https://') ? url : null;
}

export const draftPrUrl = (project: Pick<Project, 'owner' | 'repo'>, prNumber: number): string =>
  `https://github.com/${encodeURIComponent(project.owner)}/${encodeURIComponent(project.repo)}/pull/${prNumber}`;

/** The run receipt. From a board card it also carries the board, so the receipt can return there and plan again. */
export const approveRunPath = (runId: string, projectId?: string): string =>
  `/workflows?run=${encodeURIComponent(runId)}${projectId ? `&from=board&project=${encodeURIComponent(projectId)}` : ''}`;

/** The run a card's agent branch belongs to: `mergemate-agent/<runId>`. Anything else names no run. */
export function runIdFromBranch(branch: string | null | undefined): string | null {
  const match = /^mergemate-agent\/([A-Za-z0-9_-]{1,100})$/.exec(branch ?? '');
  return match ? match[1] : null;
}

export type RunWatch =
  | { state: 'planning'; card: Card }
  | { state: 'pr'; card: Card; prNumber: number }
  | { state: 'timeout'; card: Card };

/** Decides the watch state from the freshest copy of the card; polling stops on anything but 'planning'. */
export function nextWatch(card: Card, elapsedMs: number): RunWatch {
  if (card.prNumber) return { state: 'pr', card, prNumber: card.prNumber };
  return elapsedMs >= POLL_LIMIT_MS ? { state: 'timeout', card } : { state: 'planning', card };
}

export interface UseAgentRunOptions {
  api: ApiClient;
  project: Project;
  card: Card;
  onChanged: () => void;
}

export function useAgentRun({ api, project, card, onChanged }: UseAgentRunOptions) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorInfo, setErrorInfo] = useState<(ErrorDetails & { step: string }) | null>(null);
  const [lockedId, setLockedId] = useState<string | null>(null);
  const [lockedTitle, setLockedTitle] = useState<string | null>(null);
  const [planning, setPlanning] = useState(false);
  const [locking, setLocking] = useState(false);
  const [run, setRun] = useState<BrainRunResponse | null>(null);
  const [watch, setWatch] = useState<RunWatch | null>(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const guarded = useCallback(async (step: string, work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setErrorInfo(null);
    try {
      await work();
    } catch (err) {
      if (alive.current) {
        setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
        setErrorInfo({ ...(errorDetailsOf(err) ?? {}), step });
      }
    } finally {
      if (alive.current) setBusy(false);
    }
  }, []);

  const proceed = useCallback(
    () =>
      guarded('Proceed', async () => {
        setLocking(true);
        let res: Awaited<ReturnType<ApiClient['proceedBrain']>>;
        try { res = await api.proceedBrain(project.id); } finally { if (alive.current) setLocking(false); }
        if (alive.current) {
          setLockedId(res.card.id);
          setLockedTitle(res.card.title);
        }
        onChanged();
      }),
    [api, project.id, guarded, onChanged],
  );

  const plan = useCallback(
    () =>
      guarded('Plan with agent', async () => {
        setPlanning(true);
        try {
          const res = await api.runBrain(project.id);
          if (!alive.current) return;
          setRun(res);
          setWatch(res.status === 'running' ? nextWatch(res.card, 0) : null);
          onChanged();
        } finally {
          if (alive.current) setPlanning(false);
        }
      }),
    [api, project.id, guarded, onChanged],
  );

  const polledCardId = run?.status === 'running' ? run.card.id : null;
  useEffect(() => {
    if (!polledCardId || !run) return;
    const origin = run.card;
    let cancelled = false;
    const started = Date.now();
    const timer = setInterval(async () => {
      let fresh: Card | undefined;
      try {
        api.invalidateCache();
        fresh = (await api.getBrainBoard(project.id)).cards.find((c) => c.id === polledCardId);
      } catch {
        // A failed read just waits for the next tick; the time limit still applies.
      }
      if (cancelled) return;
      const next = nextWatch(fresh ?? origin, Date.now() - started);
      setWatch(next);
      if (next.state !== 'planning') {
        clearInterval(timer);
        onChanged();
      }
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // Restart only when a new running run starts.
  }, [api, project.id, polledCardId, run?.runId]);

  /** Plan again on an unlocked card: lock it (Proceed), then plan, in one tap. Proceed may lock a different card first. */
  const proceedThenPlan = useCallback(
    () =>
      guarded('Plan with agent', async () => {
        setLocking(true);
        let locked: Card;
        try { locked = (await api.proceedBrain(project.id)).card; } finally { if (alive.current) setLocking(false); }
        if (!alive.current) return;
        if (locked.id !== card.id) { setLockedId(locked.id); setLockedTitle(locked.title); onChanged(); return; }
        setPlanning(true);
        try {
          const res = await api.runBrain(project.id);
          if (!alive.current) return;
          setRun(res);
          setWatch(res.status === 'running' ? nextWatch(res.card, 0) : null);
          onChanged();
        } finally {
          if (alive.current) setPlanning(false);
        }
      }),
    [api, project.id, card.id, guarded, onChanged],
  );

  return { busy, error, errorInfo, lockedId, lockedTitle, planning, locking, run, watch, proceed, plan, proceedThenPlan, retry: plan, card };
}

export interface RunSummary {
  heading: string;
  tone: 'info' | 'good' | 'bad';
  summary: string;
  files: string[];
  branch: string | null;
  primary: { kind: 'approve' | 'open_pr' | 'retry'; label: string } | null;
}

/**
 * What the "Agent run" block shows: a heading, one line, the files, the branch and at most one main button.
 * Nothing here merges or approves on GitHub.
 */
export function runSummary(input: {
  planning: boolean;
  run: BrainRunResponse | null;
  watchBranch?: string | null;
  prNumber?: number;
  prLink: string | null;
  resumableBranch: string | null;
}): RunSummary | null {
  const { run } = input;
  if (input.planning && !run) {
    return { heading: 'Planning', tone: 'info', summary: 'The agent is reading the repo and writing a patch. This takes about a minute.', files: [], branch: null, primary: null };
  }
  if (!run) {
    if (!input.resumableBranch) return null;
    return { heading: 'Agent run', tone: 'info', summary: 'This card has an agent run. Open it to approve the patch, or plan again if it was cancelled or failed.', files: [], branch: input.resumableBranch, primary: { kind: 'approve', label: 'Open the agent run' } };
  }
  const branch = input.watchBranch ?? run.branch ?? null;
  if (input.prNumber) {
    return { heading: `Draft PR #${input.prNumber}`, tone: 'good', summary: 'Merging stays with you on GitHub.', files: run.files, branch, primary: input.prLink ? { kind: 'open_pr', label: 'Open PR' } : null };
  }
  if (run.status === 'failed') {
    return { heading: 'Failed', tone: 'bad', summary: agentErrorCopy(run.message ?? run.summary).message, files: [], branch: null, primary: { kind: 'retry', label: 'Plan again' } };
  }
  if (run.status === 'no_change') {
    return { heading: 'No change needed', tone: 'info', summary: run.summary, files: [], branch: null, primary: null };
  }
  return { heading: 'Patch ready', tone: 'info', summary: run.summary || 'Approve it to open a draft PR.', files: run.files, branch, primary: { kind: 'approve', label: 'Approve the patch' } };
}

export type CardAction = 'proceed' | 'plan' | 'proceed_plan' | 'approve' | 'open_pr';
export interface CardAgentState { tone: 'info' | 'good' | 'bad' | 'muted'; line: string; action: CardAction | null; label: string; subline?: string }

/**
 * The card's one line and one button, from everything known about it. Exactly one primary action, or none.
 * `branchRun` is the server's view of the run on the card's agent branch, used when this screen has no run in memory.
 */
export function cardAgentState(input: {
  cardStatus: Card['status'];
  locked: boolean;
  busy: 'locking' | 'planning' | null;
  run: BrainRunResponse | null;
  prNumber?: number;
  prLink: string | null;
  branchRun: { state: string; message?: string };
}): CardAgentState {
  const planAgain = (line: string, tone: CardAgentState['tone']): CardAgentState => ({ tone, line, action: input.locked ? 'plan' : 'proceed_plan', label: 'Plan again' });
  if (input.busy === 'locking') return { tone: 'info', line: 'Locking this card for you…', action: null, label: 'Locking…' };
  if (input.busy === 'planning') return { tone: 'info', line: 'The agent is reading the repo and writing a patch. This takes about a minute.', action: null, label: 'Planning…' };
  if (input.prNumber) return { tone: 'good', line: `Draft PR #${input.prNumber} opened. Merging stays with you on GitHub.`, action: input.prLink ? 'open_pr' : null, label: 'Open draft PR' };
  if (input.cardStatus !== 'open' && input.cardStatus !== 'active') return { tone: 'muted', line: `This card is ${input.cardStatus}.`, action: null, label: '' };
  const run = input.run;
  if (run) {
    if (run.status === 'running') return { tone: 'info', line: 'Patch ready. Approve it to open a draft PR.', action: 'approve', label: 'Review & approve patch' };
    if (run.status === 'failed') return planAgain(`Failed: ${agentErrorCopy(run.message ?? run.summary).message}`, 'bad');
    if (run.status === 'no_change') return planAgain(`No change needed. ${run.summary}`.trim(), 'muted');
  }
  switch (input.branchRun.state) {
    case 'loading': return { tone: 'muted', line: 'Checking the agent run…', action: null, label: '' };
    case 'waiting': return { tone: 'info', line: 'Patch ready. Approve it to open a draft PR.', action: 'approve', label: 'Review & approve patch' };
    case 'working': return { tone: 'info', line: 'The agent run is working. Open it to follow along.', action: 'approve', label: 'Open the agent run' };
    case 'stopped': return planAgain('Stopped. Plan again to get a new patch.', 'muted');
    case 'failed': return planAgain(`Failed: ${agentErrorCopy(input.branchRun.message).message}`, 'bad');
    case 'done': return { tone: 'good', line: 'The draft PR was opened.', action: null, label: '' };
    case 'unknown': return { tone: 'muted', line: 'This card has an agent run. Open it to see where it stands.', action: 'approve', label: 'Open the agent run' };
    default: break;
  }
  return input.locked
    ? { tone: 'info', line: 'Locked for you. Plan with the agent to get a patch.', action: 'plan', label: 'Plan with agent' }
    : { tone: 'muted', line: 'No agent run yet.', action: 'proceed', label: 'Proceed', subline: 'Locks this card so you can plan with the agent' };
}
