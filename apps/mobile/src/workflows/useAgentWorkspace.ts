import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import { useFocusEffect } from 'expo-router';
import type { WorkflowCapabilities, WorkflowDefinition, WorkflowRun, WorkflowTarget } from '@mergemate/contracts';
import { apiMode } from '../api';
import { toUserMessage } from '../api/errors';
import { StorageService } from '../storage';
import { onSessionChange } from '../auth/session-events';
import { WorkflowApiClient } from './api';
import { isRunActive, adoptRunUpdate } from './agent-model';

export function useAgentWorkspace(account: string, target: WorkflowTarget | null, isDemo: boolean) {
  const client = useMemo(() => apiMode.kind === 'http' && !isDemo ? new WorkflowApiClient({
    baseUrl: apiMode.baseUrl, platform: Platform.OS === 'web' ? 'web' : 'native', nativePlatform: Platform.OS === 'android' ? 'android' : 'ios',
    tokenStore: { get: () => StorageService.getSessionToken(), set: token => StorageService.setSessionToken(token), clear: () => StorageService.clearSessionToken() },
  }) : null, [account, isDemo]);
  const [capabilities, setCapabilities] = useState<WorkflowCapabilities | null>(null);
  const [capabilityLoading, setCapabilityLoading] = useState(false);
  const [capabilityError, setCapabilityError] = useState('');
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<WorkflowRun | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [definitions, setDefinitions] = useState<WorkflowDefinition[]>([]);
  const [definitionsLoading, setDefinitionsLoading] = useState(false);
  const [definitionsError, setDefinitionsError] = useState('');
  const definitionVersion = useRef(0);
  const [busy, setBusy] = useState<'plan' | 'start' | 'cancel' | 'save' | 'delete' | null>(null);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const generation = useRef(0), alive = useRef(false), actionLock = useRef(false), actionVersion = useRef(0);
  const controllers = useRef(new Set<AbortController>());
  const uncertainStart = useRef<{ fingerprint: string; key: string } | null>(null);
  const selected = useRef(selectedRun); selected.current = selectedRun;
  const controller = () => { const value = new AbortController(); controllers.current.add(value); return value; };
  const done = (value: AbortController) => controllers.current.delete(value);
  const valid = (epoch: number) => alive.current && epoch === generation.current;
  useEffect(() => {
    alive.current = true; ++generation.current;
    const invalidate = () => {
      ++generation.current; ++actionVersion.current; client?.invalidateSession();
      for (const request of controllers.current) request.abort(); controllers.current.clear();
      actionLock.current = false; uncertainStart.current = null; setBusy(null);
      ++definitionVersion.current; setDefinitions([]); setDefinitionsError(''); setDefinitionsLoading(false);
      setCapabilities(null); setRuns([]); setSelectedRun(null); setError('Your session changed. Reopen Agent workflows to continue.');
    };
    const unsubscribe = onSessionChange(invalidate);
    return () => { alive.current = false; ++generation.current; unsubscribe(); for (const request of controllers.current) request.abort(); controllers.current.clear(); client?.invalidateSession(); };
  }, [client]);
  const repoKey = target ? `${target.owner}/${target.repo}` : '';
  useEffect(() => {
    setCapabilities(null); setCapabilityError('');
    if (!client || !target) { setCapabilityLoading(false); return; }
    const epoch = generation.current, request = controller(); let current = true;
    setCapabilityLoading(true);
    client.capabilities(target, request.signal).then(value => { if (current && valid(epoch)) setCapabilities(value); })
      .catch(cause => { if (current && valid(epoch) && !request.signal.aborted) setCapabilityError(toUserMessage(cause, 'Could not check agent capabilities. Confirm the API release and integrations.')); })
      .finally(() => { done(request); if (current && valid(epoch)) setCapabilityLoading(false); });
    return () => { current = false; request.abort(); done(request); };
  }, [client, repoKey, refreshKey]);
  useEffect(() => {
    if (!client) return;
    const epoch = generation.current, request = controller(); let current = true;
    setHistoryLoading(true); setHistoryError('');
    client.runs(request.signal).then(value => { if (current && valid(epoch)) setRuns(value.runs); })
      .catch(cause => { if (current && valid(epoch) && !request.signal.aborted) setHistoryError(toUserMessage(cause, 'Could not load workflow runs.')); })
      .finally(() => { done(request); if (current && valid(epoch)) setHistoryLoading(false); });
    return () => { current = false; request.abort(); done(request); };
  }, [client, refreshKey]);
  useEffect(() => {
    if (!client) return;
    const epoch = generation.current, version = definitionVersion.current, request = controller(); let current = true;
    setDefinitionsLoading(true); setDefinitionsError('');
    client.definitions(request.signal).then(value => { if (current && valid(epoch) && version === definitionVersion.current) setDefinitions(value.definitions); })
      .catch(cause => { if (current && valid(epoch) && !request.signal.aborted) setDefinitionsError(toUserMessage(cause, 'Could not load saved workflows.')); })
      .finally(() => { done(request); if (current && valid(epoch)) setDefinitionsLoading(false); });
    return () => { current = false; request.abort(); done(request); };
  }, [client, refreshKey]);
  const saveDefinition = async (definition: WorkflowDefinition): Promise<WorkflowDefinition | null> => {
    if (!client || actionLock.current || definitionsLoading) return null;
    actionLock.current = true; const operation = ++actionVersion.current; setBusy('save'); setError('');
    const epoch = generation.current, request = controller();
    try {
      const value = await client.saveDefinition(definition, request.signal);
      if (!valid(epoch)) return null;
      ++definitionVersion.current; setDefinitions(old => [value, ...old.filter(item => item.id !== value.id)].slice(0, 20)); setDefinitionsError('');
      return value;
    } catch (cause) { if (valid(epoch) && !request.signal.aborted) setError(toUserMessage(cause, 'Could not save the workflow. Your draft is unchanged.')); return null; }
    finally { done(request); if (operation === actionVersion.current) { actionLock.current = false; if (valid(epoch)) setBusy(null); } }
  };
  const deleteDefinition = async (id: string): Promise<boolean> => {
    if (!client || actionLock.current) return false;
    actionLock.current = true; const operation = ++actionVersion.current; setBusy('delete'); setError('');
    const epoch = generation.current, request = controller();
    try {
      await client.deleteDefinition(id, request.signal);
      if (!valid(epoch)) return false;
      ++definitionVersion.current; setDefinitions(old => old.filter(item => item.id !== id)); setDefinitionsError(''); return true;
    } catch (cause) { if (valid(epoch) && !request.signal.aborted) setError(toUserMessage(cause, 'Could not delete the saved workflow. It remains in your list.')); return false; }
    finally { done(request); if (operation === actionVersion.current) { actionLock.current = false; if (valid(epoch)) setBusy(null); } }
  };
  const receive = useCallback((run: WorkflowRun) => {
    setError('');
    setSelectedRun(old => adoptRunUpdate(old, run));
    setRuns(old => { const prior = old.find(value => value.id === run.id); return [adoptRunUpdate(prior ?? null, run), ...old.filter(value => value.id !== run.id)].slice(0, 100); });
  }, []);
  useFocusEffect(useCallback(() => {
    if (!client || !selectedRun || !isRunActive(selectedRun.status)) return;
    const id = selectedRun.id, epoch = generation.current, request = controller(); let focused = true; let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const run = await client.run(id, request.signal);
        if (!focused || !valid(epoch) || selected.current?.id !== id) return;
        receive(run);
        if (isRunActive(run.status)) timer = setTimeout(poll, 2000);
      } catch (cause) { if (focused && valid(epoch) && !request.signal.aborted) { setError(toUserMessage(cause, 'Run updates paused. Refresh to reconnect.')); timer = setTimeout(poll, 5000); } }
    };
    timer = setTimeout(poll, 1500);
    return () => { focused = false; if (timer) clearTimeout(timer); request.abort(); done(request); };
  }, [client, selectedRun?.id, selectedRun ? isRunActive(selectedRun.status) : false, receive]));
  const generate = async (intent: string, mode: WorkflowDefinition['mode']): Promise<WorkflowDefinition | null> => {
    if (!client || !target || actionLock.current) return null;
    actionLock.current = true; const operation = ++actionVersion.current; setBusy('plan'); setError('');
    const epoch = generation.current, request = controller();
    try { const value = await client.plan({ intent, target, mode }, request.signal); return valid(epoch) ? value : null; }
    catch (cause) { if (valid(epoch) && !request.signal.aborted) setError(toUserMessage(cause, 'Could not generate a workflow.')); return null; }
    finally { done(request); if (operation === actionVersion.current) { actionLock.current = false; if (valid(epoch)) setBusy(null); } }
  };
  const start = async (definition: WorkflowDefinition, confirmCodeChanges: boolean) => {
    if (!client || actionLock.current) return;
    actionLock.current = true; const operation = ++actionVersion.current; setBusy('start'); setError('');
    const epoch = generation.current, request = controller();
    const fingerprint = JSON.stringify({ definition, confirmCodeChanges });
    const key = uncertainStart.current?.fingerprint === fingerprint ? uncertainStart.current.key : Crypto.randomUUID();
    uncertainStart.current = { fingerprint, key };
    try {
      const run = await client.start({ definition, idempotencyKey: key, ...(definition.mode === 'code_fix' ? { confirmCodeChanges } : {}) }, request.signal);
      if (valid(epoch)) { uncertainStart.current = null; receive(run); }
    } catch (cause) { if (valid(epoch) && !request.signal.aborted) setError(toUserMessage(cause, 'Could not start the workflow. Retry uses the same request key to avoid duplicate runs.')); }
    finally { done(request); if (operation === actionVersion.current) { actionLock.current = false; if (valid(epoch)) setBusy(null); } }
  };
  const cancel = async () => {
    const run = selected.current;
    if (!client || !run || !isRunActive(run.status) || actionLock.current) return;
    actionLock.current = true; const operation = ++actionVersion.current; setBusy('cancel'); setError('');
    const epoch = generation.current, request = controller();
    try { const value = await client.cancel(run.id, request.signal); if (valid(epoch) && selected.current?.id === run.id) receive(value); }
    catch (cause) { if (valid(epoch) && !request.signal.aborted) setError(toUserMessage(cause, 'Could not cancel the run. Its status has not been changed locally.')); }
    finally { done(request); if (operation === actionVersion.current) { actionLock.current = false; if (valid(epoch)) setBusy(null); } }
  };
  const selectRun = async (run: WorkflowRun) => {
    setSelectedRun(run); setError('');
    if (!client) return;
    const epoch = generation.current, request = controller();
    try { const value = await client.run(run.id, request.signal); if (valid(epoch) && selected.current?.id === run.id) receive(value); }
    catch (cause) { if (valid(epoch) && !request.signal.aborted) setError(toUserMessage(cause, 'Could not refresh this run.')); }
    finally { done(request); }
  };
  return { configured: !!client, capabilities, capabilityLoading, capabilityError, runs, selectedRun, historyLoading, historyError, definitions, definitionsLoading, definitionsError, saveDefinition, deleteDefinition, busy, error, generate, start, cancel, selectRun, clearRun: () => setSelectedRun(null), clearError: () => setError(''), refresh: () => setRefreshKey(value => value + 1) };
}
