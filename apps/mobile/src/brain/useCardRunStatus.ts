import { useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { apiMode } from '../api';
import { StorageService } from '../storage';
import { useAuth } from '../context/AuthContext';
import { WorkflowApiClient } from '../workflows/api';

/** What the run on a card's agent branch is doing, read from the server instead of guessed. */
export type BranchRunState =
  | { state: 'none' }
  | { state: 'loading' }
  | { state: 'waiting' }
  | { state: 'working' }
  | { state: 'stopped' }
  | { state: 'failed'; message: string }
  | { state: 'done' }
  | { state: 'unknown' };

export function useCardRunStatus(runId: string | null, refresh: unknown): BranchRunState {
  const { user, isDemo } = useAuth();
  const client = useMemo(() => apiMode.kind === 'http' && !isDemo ? new WorkflowApiClient({
    baseUrl: apiMode.baseUrl, platform: Platform.OS === 'web' ? 'web' : 'native', nativePlatform: Platform.OS === 'android' ? 'android' : 'ios',
    tokenStore: { get: () => StorageService.getSessionToken(), set: (token) => StorageService.setSessionToken(token), clear: () => StorageService.clearSessionToken() },
  }) : null, [user?.id, isDemo]);
  const [value, setValue] = useState<BranchRunState>({ state: 'none' });
  useEffect(() => {
    if (!runId) { setValue({ state: 'none' }); return; }
    if (!client) { setValue({ state: 'unknown' }); return; }
    setValue({ state: 'loading' });
    const controller = new AbortController();
    client.run(runId, controller.signal).then((run) => {
      const status = run.status;
      setValue(status === 'waiting_approval' ? { state: 'waiting' }
        : status === 'succeeded' ? { state: 'done' }
        : status === 'failed' ? { state: 'failed', message: run.error ?? 'The run failed.' }
        : status === 'cancelled' || status === 'blocked' ? { state: 'stopped' }
        : { state: 'working' });
    }, () => { if (!controller.signal.aborted) setValue({ state: 'unknown' }); });
    return () => controller.abort();
  }, [client, runId, refresh]);
  return value;
}
