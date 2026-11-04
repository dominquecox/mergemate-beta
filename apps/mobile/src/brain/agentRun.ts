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
        if (alive.current) setLockedId(res.card.id);
        onChanged();
      }),
    [api, project.id, guarded, onChanged],
  );

  const plan = useCallback(
    () =>
      guarded('Plan with agent', async () => {
        const res = await api.runBrain(project.id);
        if (!alive.current) return;
        setRun(res);
        setWatch(res.status === 'running' ? nextWatch(res.card, 0) : null);
        onChanged();
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

  return { busy, error, errorInfo, lockedId, run, watch, proceed, plan, retry: plan, card };
}
