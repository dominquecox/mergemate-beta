import { useCallback, useEffect, useRef, useState } from 'react';
import type { BrainRunResponse, Card, Lock, Project } from '@mergemate/contracts';
import type { ApiClient } from '../api/client';
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

export const approveRunPath = (runId: string): string => `/workflows?run=${encodeURIComponent(runId)}`;

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
        const res = await api.proceedBrain(project.id);
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

  return { busy, error, errorInfo, lockedId, lockedTitle, planning, run, watch, proceed, plan, retry: plan, card };
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
    return { heading: 'Planning', tone: 'info', summary: 'The agent is reading the repository and preparing a patch.', files: [], branch: null, primary: null };
  }
  if (!run) {
    if (!input.resumableBranch) return null;
    return { heading: 'Agent run', tone: 'info', summary: 'Open the run to see where it stands and approve the patch if it is waiting.', files: [], branch: input.resumableBranch, primary: { kind: 'approve', label: 'Open the agent run' } };
  }
  const branch = input.watchBranch ?? run.branch ?? null;
  if (input.prNumber) {
    return { heading: `Draft PR #${input.prNumber}`, tone: 'good', summary: 'Merging stays with you on GitHub.', files: run.files, branch, primary: input.prLink ? { kind: 'open_pr', label: 'Open PR' } : null };
  }
  if (run.status === 'failed') {
    return { heading: 'Failed', tone: 'bad', summary: run.message ?? run.summary, files: [], branch: null, primary: { kind: 'retry', label: 'Retry' } };
  }
  if (run.status === 'no_change') {
    return { heading: 'No change needed', tone: 'info', summary: run.summary, files: [], branch: null, primary: null };
  }
  return { heading: 'Patch ready', tone: 'info', summary: run.summary || 'Approve the exact patch with a passkey to open a draft PR.', files: run.files, branch, primary: { kind: 'approve', label: 'Approve the patch' } };
}
