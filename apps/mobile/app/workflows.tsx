import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, ScrollView, Pressable, TextInput, KeyboardAvoidingView, Platform, Modal, Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { WorkflowDefinition } from '@mergemate/contracts';
import { WorkflowDefinition as DefinitionSchema, WorkflowTarget as TargetSchema } from '@mergemate/contracts';
import { useAuth } from '../src/context/AuthContext';
import { useConsent } from '../src/context/ConsentContext';
import { useTheme } from '../src/context/ThemeContext';
import { useLayout } from '../src/layout/useLayout';
import { api, apiMode } from '../src/api';
import { webAppOrigin } from '../src/api/config';
import { toUserMessage } from '../src/api/errors';
import { Text } from '../src/components/Text';
import { Header } from '../src/components/Header';
import { useFeatureFlags } from '../src/hooks/useFeatureFlags';
import { homeHref } from '../src/navigation/items';
import { Icon, type IconName } from '../src/components/Icon';
import { Button } from '../src/components/Button';
import { InfoTip } from '../src/components/InfoTip';
import { AccessGuidanceBanner } from '../src/components/AccessGuidanceBanner';
import { EmptyState } from '../src/components/EmptyState';
import { LoadingState } from '../src/components/LoadingState';
import { ErrorState } from '../src/components/ErrorState';
import { AgentRunPanel } from '../src/workflows/AgentRunPanel';
import { CopyDetailsButton } from '../src/components/CopyDetailsButton';
import { WorkflowCanvas } from '../src/workflows/WorkflowCanvas';
import { WorkflowNodeInspector } from '../src/workflows/WorkflowNodeInspector';
import { WorkflowPlanCard } from '../src/workflows/WorkflowPlanCard';
import { useAgentWorkspace } from '../src/workflows/useAgentWorkspace';
import { workflowApprovalUrl,workflowRunParam } from '../src/workflows/run-handoff';
import { useRepoPrList } from '../src/hooks/useRepoPrList';
import { useRepoBranches } from '../src/hooks/useRepoBranches';
import {
  AGENT_TEMPLATES,
  saveDraftFor,
  applySaveDraft,
  SAVE_DESCRIPTION_MAX,
  targetFromUrl,
  isRepositoryPickerTarget,
  displayRunStatus,
  sameTarget,
  isRunActive,
  type AgentMode,
} from '../src/workflows/agent-model';

export default function AgentWorkflowsScreen() {
  const { user, isDemo } = useAuth();
  const params = useLocalSearchParams<{ target?: string; mode?: string; template?: string; run?:string }>();
  const target = typeof params.target === 'string' && targetFromUrl(params.target) ? params.target : '';
  const templateParam = typeof params.template === 'string' && AGENT_TEMPLATES.some((t) => t.id === params.template) ? params.template : '';
  const initialRunId=workflowRunParam(params.run);
  const mode: AgentMode =
    templateParam
      ? AGENT_TEMPLATES.find((t) => t.id === templateParam)!.mode
      : params.mode === 'code_fix'
        ? 'code_fix'
        : 'review';
  return user ? (
    <AgentWorkspace
      key={`${user.id}:${target}:${mode}:${templateParam}:${initialRunId}`}
      account={user.id}
      isDemo={isDemo}
      initialTarget={target}
      initialMode={mode}
      initialTemplateId={templateParam}
      initialRunId={initialRunId}
    />
  ) : (
    <LoadingState title="Checking your session..." message="Workflow runs belong to your account." />
  );
}

function AgentWorkspace({
  account,
  isDemo,
  initialTarget,
  initialMode,
  initialTemplateId,
  initialRunId,
}: {
  account: string;
  isDemo: boolean;
  initialTarget: string;
  initialMode: AgentMode;
  initialTemplateId: string;
  initialRunId:string;
}) {
  const { colors, typography, radius } = useTheme();
  const { isDesktop } = useLayout();
  const { aiConsentGranted, needsReview, pending: consentPending } = useConsent();
  const router = useRouter();
  const flags = useFeatureFlags();
  const starterTemplate = AGENT_TEMPLATES.find((t) => t.id === initialTemplateId)
    ?? AGENT_TEMPLATES.find((t) => t.id === (initialMode === 'code_fix' ? 'fix_issue' : 'review'))
    ?? AGENT_TEMPLATES[0]!;
  const [targetText, setTargetText] = useState(initialTarget);
  const [baseBranch, setBaseBranch] = useState('');
  const [mode, setMode] = useState<AgentMode>(starterTemplate.mode);
  const [intent, setIntent] = useState(starterTemplate.intent);
  const [definition, setDefinition] = useState<WorkflowDefinition | null>(null);
  const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(null);
  const [confirmCodeChanges, setConfirmCodeChanges] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [localError, setLocalError] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [targetModalOpen, setTargetModalOpen] = useState(false);
  const [saveSheet, setSaveSheet] = useState<null | { copy: boolean; name: string; description: string; error: string }>(null);
  const [justSavedId, setJustSavedId] = useState<string | null>(null);
  const [showAllTemplates, setShowAllTemplates] = useState(false);
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const promptRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const composerY = useRef(0);
  // The run receipt renders below the builder; bring it into view whenever a run is opened.
  const runPanelRef = useRef<React.ComponentRef<typeof View>>(null);
  const savedLayout = useRef({ column: 0, cell: 0 });
  const [projectTargets, setProjectTargets] = useState<Array<{ label: string; sublabel: string; url: string; kind: 'pr' | 'repo' }>>([]);
  const [projectTargetsError, setProjectTargetsError] = useState('');
  const [projectTargetsLoading, setProjectTargetsLoading] = useState(true);
  const projectTargetsVersion = useRef(0);
  const [selectedPr, setSelectedPr] = useState<number | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [showBranchInput, setShowBranchInput] = useState(false);
  const [branchInput, setBranchInput] = useState('');
  const draftVersion = useRef(0);

  const loadProjectTargets = useCallback(async () => {
    const version = ++projectTargetsVersion.current;
    setProjectTargetsLoading(true);
    setProjectTargetsError('');
    const [pageResult, reposResult] = await Promise.allSettled([
      api.getNotificationPage('all'),
      api.getRepos(),
    ]);
    if (version !== projectTargetsVersion.current) return;
    const page = pageResult.status === 'fulfilled' ? pageResult.value : { items: [] };
    const repos = reposResult.status === 'fulfilled' ? reposResult.value : [];
    const failure = pageResult.status === 'rejected' ? pageResult.reason : reposResult.status === 'rejected' ? reposResult.reason : null;
    if (failure) {
      setProjectTargetsError(toUserMessage(failure, 'Could not load all pull requests and repositories. Try again.'));
    }
    const list: Array<{ label: string; sublabel: string; url: string; kind: 'pr' | 'repo' }> = [];
    const seen = new Set<string>();
    for (const item of page.items) {
      const key = `${item.repo}#${item.number}`;
      if (seen.has(key)) continue;
      seen.add(key);
      list.push({
        label: `${item.repo} #${item.number}`,
        sublabel: item.title,
        url: `https://github.com/${item.repo}/pull/${item.number}`,
        kind: 'pr',
      });
    }
    for (const r of repos) {
      if (!r.watching || seen.has(r.fullName)) continue;
      seen.add(r.fullName);
      list.push({
        label: r.fullName,
        sublabel: 'Watched repository',
        url: `https://github.com/${r.fullName}`,
        kind: 'repo',
      });
    }
    setProjectTargets(list);
    if (!initialTarget && list[0]?.kind === 'pr') {
      const firstUrl = list[0].url;
      setTargetText(firstUrl);
      const parsed = targetFromUrl(firstUrl);
      if (parsed) {
        setDefinition((prev) => (prev ? { ...prev, target: parsed } : prev));
      }
    }
    setProjectTargetsLoading(false);
  }, [initialTarget]);

  useEffect(() => {
    void loadProjectTargets();
    return () => {
      projectTargetsVersion.current++;
    };
  }, [loadProjectTargets]);

  const target = useMemo(() => {
    const parsed = targetFromUrl(targetText);
    if (!parsed) return null;
    const value = TargetSchema.safeParse({
      ...parsed,
      ...(mode === 'code_fix' && baseBranch.trim() ? { baseBranch: baseBranch.trim() } : {}),
    });
    return value.success ? value.data : null;
  }, [targetText, baseBranch, mode]);

  // Extract owner/repo from target for PR/branch pickers
  const { owner: targetOwner, repo: targetRepo } = useMemo(() => {
    if (!target) return { owner: null, repo: null };
    return { owner: target.owner, repo: target.repo };
  }, [target]);

  const isRepoOnly = useMemo(() => {
    return isRepositoryPickerTarget(target);
  }, [target]);

  const { prs, loading: prLoading, error: prError } = useRepoPrList(isRepoOnly ? targetOwner : null, isRepoOnly ? targetRepo : null);
  const { branches, defaultBranch, loading: branchLoading, error: branchError } = useRepoBranches(isRepoOnly && mode === 'code_fix' ? targetOwner : null, isRepoOnly && mode === 'code_fix' ? targetRepo : null);

  const workspace = useAgentWorkspace(account, target, isDemo,initialRunId);
  const selectedRunId = workspace.selectedRun?.id;
  useEffect(() => {
    if (!selectedRunId) return;
    const frame = requestAnimationFrame(() => {
      const node = runPanelRef.current as unknown as { scrollIntoView?: (options: ScrollIntoViewOptions) => void } | null;
      if (Platform.OS === 'web' && typeof node?.scrollIntoView === 'function') node.scrollIntoView({ behavior: 'smooth', block: 'start' });
      else scrollRef.current?.scrollTo({ y: Math.max(0, composerY.current - 12), animated: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedRunId]);
  const busy = workspace.busy !== null;
  const consentReady = aiConsentGranted && !needsReview && !consentPending;
  
  // Check if PR or branch is selected when repo-only target
  const prSelected = !isRepoOnly || mode !== 'review' || selectedPr !== null;
  const branchSelected = !isRepoOnly || mode !== 'code_fix' || selectedBranch !== null;
  
  const targetCompatible = !!target && (mode === 'code_fix' || (target.kind ?? 'pull_request') === 'pull_request') && prSelected && branchSelected;
  const capability = mode === 'code_fix' ? workspace.capabilities?.coding : workspace.capabilities?.analysis;
  // Coding workflows appear only where the API confirms an executor (dev today); elsewhere the screen offers review workflows only.
  const codingEnabled = workspace.capabilities?.coding.available === true;
  const canRun =
    !!definition &&
    !!target &&
    sameTarget(definition.target, target) &&
    !!capability?.available &&
    workspace.configured &&
    consentReady &&
    (!confirmRequired(definition) || confirmCodeChanges) &&
    !busy &&
    prSelected &&
    branchSelected;

  const surface = {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  };
  const input = {
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderLight,
    color: colors.text,
    backgroundColor: colors.surfaceElevated,
    fontFamily: typography.body.fontFamily,
    fontSize: 13,
  };

  const resetDraft = () => {
    draftVersion.current++;
    setDefinition(null);
    setSelectedStepIndex(null);
    setConfirmCodeChanges(false);
    setLocalError('');
    setSavedMessage('');
    workspace.clearError();
    workspace.clearRun();
  };

  const focusComposer = () => {
    scrollRef.current?.scrollTo({ y: Math.max(0, composerY.current - 12), animated: true });
    requestAnimationFrame(() => promptRef.current?.focus());
  };

  const selectPr = (prNumber: number) => {
    if (!targetOwner || !targetRepo) return;
    const prUrl = `https://github.com/${targetOwner}/${targetRepo}/pull/${prNumber}`;
    setSelectedPr(prNumber);
    setTargetText(prUrl);
    const nextParsed = targetFromUrl(prUrl);
    if (definition && nextParsed) {
      const nextTarget = TargetSchema.safeParse({
        ...nextParsed,
        ...(definition.mode === 'code_fix' && baseBranch.trim() ? { baseBranch: baseBranch.trim() } : {}),
      });
      if (nextTarget.success) {
        setDefinition({ ...definition, target: nextTarget.data });
        setConfirmCodeChanges(false);
        setLocalError('');
      }
    }
  };

  const selectBranch = (branchName: string) => {
    if (!targetOwner || !targetRepo) return;
    setSelectedBranch(branchName);
    setBaseBranch(branchName);
    resetDraft();
  };

  const submitBranchInput = () => {
    if (branchInput.trim()) {
      selectBranch(branchInput.trim());
      setShowBranchInput(false);
      setBranchInput('');
    }
  };

  const chooseTemplate = (id: string) => {
    if (busy) return;
    const template = AGENT_TEMPLATES.find((value) => value.id === id)!;
    setMode(template.mode);
    setIntent(template.intent);
    setConfirmCodeChanges(false);
    setSelectedStepIndex(null);
    setLocalError('');
    workspace.clearRun();
    setDefinition(null);
    draftVersion.current++;
  };

  useEffect(() => {
    if (workspace.capabilities && !codingEnabled && mode === 'code_fix' && !busy) chooseTemplate('review');
  }, [workspace.capabilities, codingEnabled, mode]);

  const generate = async () => {
    if (!targetCompatible || !consentReady) return;
    const version = ++draftVersion.current;
    setLocalError('');
    setConfirmCodeChanges(false);
    setSelectedStepIndex(null);
    workspace.clearRun();
    const value = await workspace.generate(intent.trim(), mode);
    if (value && version === draftVersion.current) {
      if (value.mode !== mode || !target || !sameTarget(value.target, target)) {
        setLocalError('Generated workflow did not match the requested target and mode. Generate again.');
        return;
      }
      setDefinition(withoutId(value));
      setIntent(value.intent);
    }
  };

  const changeDefinition = (next: WorkflowDefinition | null) => {
    if (busy) return;
    if (!next) {
      setLocalError(
        'That edit would break a required dependency. Keep context first, then patch, tests and draft PR in order for coding runs.',
      );
      return;
    }
    setLocalError('');
    setDefinition(next);
    setConfirmCodeChanges(false);
  };

  const retry = () => {
    const run = workspace.selectedRun;
    if (!run || busy) return;
    const d = run.definition;
    setTargetText(targetUrl(d));
    setBaseBranch(d.target.baseBranch ?? '');
    setMode(d.mode);
    setIntent(d.intent);
    setDefinition(withoutId(d));
    setSelectedStepIndex(null);
    setConfirmCodeChanges(false);
    setLocalError('');
    workspace.clearRun();
  };

  const openSaved = (value: WorkflowDefinition) => {
    if (busy) return;
    ++draftVersion.current;
    setTargetText(targetUrl(value));
    setBaseBranch(value.target.baseBranch ?? '');
    setMode(value.mode);
    setIntent(value.intent);
    setDefinition(value);
    setSelectedStepIndex(null);
    setConfirmCodeChanges(false);
    setPendingDelete(null);
    setLocalError('');
    setSavedMessage('Opened saved workflow.');
    workspace.clearRun();
    workspace.clearError();
  };

  const openSaveSheet = (copy = false) => {
    if (!definition || busy) return;
    setSaveSheet({ copy, ...saveDraftFor(definition, copy), error: '' });
  };

  const saveWorkflow = async () => {
    if (!definition || busy || !saveSheet) return;
    const applied = applySaveDraft(saveSheet.copy ? withoutId(definition) : definition, saveSheet);
    if ('error' in applied) {
      setSaveSheet({ ...saveSheet, error: applied.error });
      return;
    }
    const version = draftVersion.current;
    setSavedMessage('');
    const value = await workspace.saveDefinition(applied.definition);
    if (value && version === draftVersion.current) {
      setDefinition(value);
      setConfirmCodeChanges(false);
      setSaveSheet(null);
      setJustSavedId(value.id ?? null);
      setSavedMessage(`Saved "${value.name}". It is at the top of Saved workflows.`);
      // Bring the saved list into view so the new item is visible right away.
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: Math.max(0, savedLayout.current.column + savedLayout.current.cell - 12), animated: true }));
    }
  };

  const removeSaved = async (id: string) => {
    const removed = await workspace.deleteDefinition(id);
    if (removed) {
      setPendingDelete(null);
      setDefinition((old) => (old?.id === id ? withoutId(old) : old));
      setSavedMessage('Saved workflow deleted. Existing run receipts are unchanged.');
    }
  };

  const filteredTemplates = useMemo(() => {
    const q = searchFilter.trim().toLowerCase(),available = AGENT_TEMPLATES.filter((t) => codingEnabled || t.mode === 'review');
    if (!q) return available;
    return available.filter(
      (t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q),
    );
  }, [searchFilter, codingEnabled]);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.background }}>
      <Header
        title="Workflows"
        showBack
        onBack={() => (router.canGoBack() ? router.back() : router.replace(homeHref(flags)))}
        rightAction={<Button title="Refresh" variant="ghost" disabled={busy} onPress={workspace.refresh} />}
      />
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerStyle={{ padding: isDesktop ? 22 : 14, paddingBottom: 48, gap: 16 }}
      >
        {/* Mexas Workflows Top Header Bar */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <View style={{ gap: 2, flex: 1, minWidth: 220 }}>
            <Text accessibilityRole="header" style={[typography.title1, { color: colors.text }]}>
              Put your agents to work.
            </Text>
            <Text style={[typography.footnote, { color: colors.textSecondary }]}>
              Manage and monitor your AI-powered review and coding workflows.
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Focus workflow composer"
              disabled={busy}
              onPress={focusComposer}
              style={({ pressed }) => ({
                minHeight: 44,
                paddingHorizontal: 14,
                borderRadius: 10,
                backgroundColor: colors.brand,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Icon name="add" size={16} color="#FFFFFF" />
              <Text style={[typography.caption, { color: '#FFFFFF', fontWeight: '700' }]}>Build Workflow</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Toggle workflow filter"
              onPress={() => setShowSearch((prev) => !prev)}
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: showSearch ? colors.brandLight : colors.border,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="search-outline" size={17} color={colors.textSecondary} />
            </Pressable>
          </View>
        </View>

        {showSearch && (
          <TextInput
            accessibilityLabel="Filter templates and workflows"
            value={searchFilter}
            onChangeText={setSearchFilter}
            placeholder="Filter workflows by name or capability..."
            placeholderTextColor={colors.textMuted}
            style={input}
          />
        )}

        {!workspace.configured && (
          <View style={[surface, { gap: 4, borderColor: colors.brandMuted }]}>
            <Text style={[typography.subhead, { color: colors.text, fontWeight: '700' }]}>Explore the builder</Text>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>
              Templates are available here. Real model generation and runs require a signed-in connection to the workflow API; demo mode does not simulate agent execution.
            </Text>
          </View>
        )}

        <AccessGuidanceBanner error={localError || workspace.error || workspace.capabilityError} compact />

        <View
          onLayout={(event) => { savedLayout.current.column = event.nativeEvent.layout.y; }}
          style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 12, alignItems: 'stretch' }}
        >
            {/* Bento Cell 3: Saved Workflows */}
            <View onLayout={(e) => { savedLayout.current.cell = e.nativeEvent.layout.y; }} style={[surface, { gap: 8, flex: 1, minWidth: 0 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text accessibilityRole="header" style={[typography.headline, { color: colors.text }]}>
                  Saved workflows
                </Text>
                <InfoTip
                  title="Saved Workflows"
                  body="Workflows saved to your account persist across desktop and mobile sessions so you can re-run or customize them anytime."
                  size={15}
                />
              </View>
              {!!savedMessage && (
                <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[typography.footnote, { color: colors.brandLight }]}>
                  {savedMessage}
                </Text>
              )}
              {workspace.definitionsLoading ? (
                <Text style={[typography.caption, { color: colors.textSecondary }]}>Loading saved workflows...</Text>
              ) : workspace.definitionsError ? (
                <Text accessibilityRole="alert" style={[typography.caption, { color: colors.statusAlert }]}>
                  {workspace.definitionsError}
                </Text>
              ) : workspace.definitions.length ? (
                workspace.definitions.map((value) => (
                  <View
                    key={value.id}
                    style={{
                      padding: 10,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: definition?.id === value.id ? colors.brandLight : colors.border,
                      backgroundColor: justSavedId === value.id ? colors.brandSubtle : colors.surfaceElevated,
                      gap: 6,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Edit saved workflow ${value.name}`}
                        disabled={busy}
                        onPress={() => openSaved(value)}
                        style={{ flex: 1, minHeight: 44, justifyContent: 'center' }}
                      >
                        <Text style={[typography.subhead, { color: colors.text, fontWeight: '600' }]}>{value.name}</Text>
                        <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>
                          {value.mode === 'review' ? 'PR review' : 'Coding workflow'} · {value.target.owner}/{value.target.repo}
                        </Text>
                        {!!value.description && (
                          <Text numberOfLines={2} style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>
                            {value.description}
                          </Text>
                        )}
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Delete saved workflow ${value.name}`}
                        disabled={busy}
                        onPress={() => setPendingDelete(value.id ?? null)}
                        style={{ width: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' }}
                      >
                        <Icon name="trash-outline" size={17} color={colors.textSecondary} />
                      </Pressable>
                    </View>
                    {pendingDelete === value.id && (
                      <View style={{ gap: 6 }}>
                        <Text style={[typography.caption, { color: colors.textSecondary }]}>
                          Delete this saved definition? Existing runs will not be cancelled or removed.
                        </Text>
                        <Button
                          title="Confirm delete workflow"
                          variant="destructive"
                          loading={workspace.busy === 'delete'}
                          disabled={busy}
                          onPress={() => removeSaved(value.id!)}
                        />
                        <Button title="Keep saved workflow" variant="ghost" disabled={busy} onPress={() => setPendingDelete(null)} />
                      </View>
                    )}
                  </View>
                ))
              ) : (
                <Text style={[typography.caption, { color: colors.textSecondary }]}>
                  Save a workflow to edit and reuse it across sessions.
                </Text>
              )}
            </View>

            {/* Bento Cell 4: Recent Runs */}
            <View style={[surface, { gap: 8, flex: 1, minWidth: 0 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text accessibilityRole="header" style={[typography.headline, { color: colors.text }]}>
                  Recent runs
                </Text>
                <InfoTip
                  title="Recent Runs"
                  body="Execution receipts from past workflow runs. Select any run to inspect its step-by-step output, evidence, and verification status."
                  size={15}
                />
              </View>
              {workspace.historyLoading ? (
                <Text style={[typography.caption, { color: colors.textSecondary }]}>Loading runs...</Text>
              ) : workspace.historyError ? (
                <Text accessibilityRole="alert" style={[typography.caption, { color: colors.statusAlert }]}>
                  {workspace.historyError}
                </Text>
              ) : workspace.runs.length ? (
                workspace.runs.map((run) => (
                  <Pressable
                    key={run.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Inspect run ${run.definition.name}`}
                    disabled={busy}
                    onPress={() => void workspace.selectRun(run)}
                    style={{
                      minHeight: 54,
                      padding: 10,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.surfaceElevated,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                    }}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={[typography.subhead, { color: colors.text, fontWeight: '600' }]}>
                        {run.definition.name}
                      </Text>
                      <Text style={[typography.caption, { color: colors.textSecondary }]}>
                        {displayRunStatus(run.status)}
                      </Text>
                    </View>
                    <Icon name="chevron-forward" size={15} color={colors.textMuted} />
                  </Pressable>
                ))
              ) : (
                <Text style={[typography.caption, { color: colors.textSecondary }]}>
                  No execution receipts loaded yet.
                </Text>
              )}
            </View>
        </View>

        {/* Composer is the primary action; starter workflows remain secondary. */}
        <View
          onLayout={(event) => { composerY.current = event.nativeEvent.layout.y; }}
          style={{ flexDirection: isDesktop ? 'row-reverse' : 'column-reverse', gap: 16, alignItems: isDesktop ? 'flex-start' : 'stretch' }}
        >
          {/* Starter workflows */}
          <View style={{ width: isDesktop ? 330 : '100%', gap: 12 }}>
            {/* Bento Cell 1: Starter Workflows (Mexas List Style) */}
            <View style={[surface, { gap: 10 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text accessibilityRole="header" style={[typography.headline, { color: colors.text }]}>
                    Start with a workflow
                  </Text>
                  <InfoTip
                    title="Starter Workflows"
                    body="Tap a template to prefill the composer. Choose a target, adjust the prompt, then use Create workflow to build the plan inline."
                    size={15}
                  />
                </View>
                <Text style={[typography.caption, { color: colors.brandLight }]}>{filteredTemplates.length} templates</Text>
              </View>
              {(isDesktop || showAllTemplates || searchFilter.trim() ? filteredTemplates : filteredTemplates.slice(0, 3)).map((template) => {
                const active = mode === template.mode && intent === template.intent;
                return (
                  <Pressable
                    key={template.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Use ${template.name} template`}
                    disabled={busy}
                    onPress={() => chooseTemplate(template.id)}
                    style={({ pressed }) => ({
                      padding: 12,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: active ? colors.brandLight : colors.border,
                      backgroundColor: active ? colors.brandSubtle : colors.surfaceElevated,
                      opacity: pressed ? 0.82 : 1,
                      gap: 6,
                    })}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 10,
                          backgroundColor: colors.surface,
                          borderWidth: 1,
                          borderColor: colors.border,
                          justifyContent: 'center',
                          alignItems: 'center',
                        }}
                      >
                        <Icon name={template.icon as IconName} size={17} color={colors.brandLight} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text numberOfLines={1} style={[typography.subhead, { color: colors.text, fontWeight: '600' }]}>
                          {template.name}
                        </Text>
                        <Text style={[typography.caption, { color: colors.brandLight, fontSize: 10 }]}>
                          {template.mode === 'review' ? 'REVIEW AGENT' : 'CODING AGENT'} · {template.kinds.length} steps
                        </Text>
                      </View>
                      <Icon name="ellipsis-horizontal" size={15} color={colors.textMuted} />
                    </View>
                    {isDesktop && (
                      <Text numberOfLines={2} style={[typography.caption, { color: colors.textSecondary }]}>
                        {template.description}
                      </Text>
                    )}
                  </Pressable>
                );
              })}
              {!isDesktop && !searchFilter.trim() && filteredTemplates.length > 3 && (
                <Button
                  title={showAllTemplates ? 'Show fewer templates' : `Show all ${filteredTemplates.length} templates`}
                  variant="ghost"
                  onPress={() => setShowAllTemplates((value) => !value)}
                />
              )}
            </View>

          </View>

          {/* Right Bento Workspace: Prompt Builder, AI Plan Card, Visual Node Canvas & Inspector */}
          <View style={{ flex: 1, width: '100%', minWidth: 0, gap: 14 }}>
            {/* Top Bento Row: Prompt Composer + Conversational AI Plan Card */}
            <View style={{ flexDirection: isDesktop && definition ? 'row' : 'column', gap: 14, alignItems: 'stretch' }}>
              <View style={[surface, { flex: isDesktop && definition ? 6 : undefined, backgroundColor: colors.brandSubtle, borderColor: colors.brandMuted, gap: 10 }]}>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                    <Icon name="sparkles-outline" size={16} color={colors.brandLight} />
                    <Text style={[typography.code, { color: colors.brandLight, fontSize: 10, letterSpacing: 1 }]}>
                      WHAT WOULD YOU LIKE TO AUTOMATE TODAY?
                    </Text>
                  </View>
                  <InfoTip
                    title="Workflow Target & Action"
                    body="Pick an open PR or watched repository from your project dropdown, choose an automation action, and customize or run the visual node graph."
                    size={15}
                  />
                </View>

                {/* Project PR / Repository Dropdown Selector */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Select target PR or repository from your projects"
                  disabled={busy}
                  onPress={() => setTargetModalOpen(true)}
                  style={({ pressed }) => ({
                    minHeight: 44,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 10,
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.brandMuted,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                    <Icon name="git-pull-request-outline" size={15} color={colors.brandLight} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[typography.caption, { color: colors.textMuted, fontSize: 10 }]}>
                        SELECT TARGET FROM ACTIVE PRS & REPOS
                      </Text>
                      <Text numberOfLines={1} style={[typography.caption, { color: colors.text, fontWeight: '700' }]}>
                        {target ? `${target.owner}/${target.repo}${target.number ? ` #${target.number}` : ''}` : 'Choose a PR or repository from your projects...'}
                      </Text>
                    </View>
                  </View>
                  <Icon name="chevron-down" size={15} color={colors.textSecondary} />
                </Pressable>
                <TextInput
                  ref={promptRef}
                  accessibilityLabel="Workflow task"
                  value={intent}
                  editable={!busy}
                  onChangeText={(value) => {
                    setIntent(value);
                    resetDraft();
                  }}
                  maxLength={2000}
                  multiline
                  placeholder="Review this PR for risk, or investigate an issue and prepare a tested fix..."
                  placeholderTextColor={colors.textMuted}
                  style={[input, { minHeight: 74, textAlignVertical: 'top', lineHeight: 19 }]}
                />
                {codingEnabled && <View style={{ flexDirection: 'row', gap: 8 }} accessibilityRole="radiogroup">
                  {(['review', 'code_fix'] as const).map((value) => (
                    <Pressable
                      key={value}
                      accessibilityRole="radio"
                      accessibilityLabel={value === 'review' ? 'PR review workflow' : 'Code fix workflow'}
                      accessibilityState={{ checked: mode === value, disabled: busy }}
                      aria-checked={mode === value}
                      disabled={busy}
                      onPress={() => {
                        setMode(value);
                        resetDraft();
                      }}
                      style={{
                        flex: 1,
                        minHeight: 44,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: mode === value ? colors.brandLight : colors.border,
                        justifyContent: 'center',
                        alignItems: 'center',
                        backgroundColor: mode === value ? colors.brand : colors.surface,
                      }}
                    >
                      <Text style={[typography.subhead, { color: mode === value ? '#FFFFFF' : colors.text, fontWeight: '600' }]}>
                        {value === 'review' ? 'Review a PR' : 'Prepare a fix'}
                      </Text>
                    </Pressable>
                  ))}
                </View>}

                {/* PR Picker for Review Mode with Repo Target */}
                {isRepoOnly && mode === 'review' && (
                  <View style={{ gap: 8 }}>
                    <Text style={[typography.caption, { color: colors.textSecondary, fontWeight: '600' }]}>
                      SELECT A PULL REQUEST
                    </Text>
                    {prLoading ? (
                      <Text style={[typography.caption, { color: colors.textMuted }]}>Loading pull requests...</Text>
                    ) : prError ? (
                      <Text accessibilityRole="alert" style={[typography.caption, { color: colors.riskHigh }]}>{prError}</Text>
                    ) : prs.length === 0 ? (
                      <Text style={[typography.caption, { color: colors.textSecondary }]}>
                        No open pull requests found for this repository.
                      </Text>
                    ) : (
                      <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
                        {prs.map((pr) => (
                          <Pressable
                            key={pr.number}
                            onPress={() => selectPr(pr.number)}
                            style={({ pressed }) => ({
                              padding: 10,
                              borderRadius: 8,
                              borderWidth: 1,
                              borderColor: selectedPr === pr.number ? colors.brandLight : colors.border,
                              backgroundColor: selectedPr === pr.number ? colors.brandSubtle : colors.surfaceElevated,
                              marginBottom: 6,
                              opacity: pressed ? 0.85 : 1,
                            })}
                          >
                            <Text style={[typography.code, { color: colors.text, fontWeight: '600', fontSize: 12 }]}>
                              #{pr.number}
                            </Text>
                            <Text style={[typography.caption, { color: colors.text, marginTop: 4 }]} numberOfLines={1}>
                              {pr.title}
                            </Text>
                            <Text style={[typography.code, { color: colors.textSecondary, fontSize: 10, marginTop: 2 }]}>
                              {pr.author} · {pr.status}
                            </Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    )}
                  </View>
                )}

                {/* Branch Picker for Code Fix Mode with Repo Target */}
                {isRepoOnly && mode === 'code_fix' && (
                  <View style={{ gap: 8 }}>
                    <Text style={[typography.caption, { color: colors.textSecondary, fontWeight: '600' }]}>
                      SELECT A BRANCH
                    </Text>
                    {branchLoading ? (
                      <Text style={[typography.caption, { color: colors.textMuted }]}>Loading branches...</Text>
                    ) : branchError ? (
                      <Text accessibilityRole="alert" style={[typography.caption, { color: colors.riskHigh }]}>{branchError}</Text>
                    ) : branches.length === 0 ? (
                      <Text style={[typography.caption, { color: colors.textSecondary }]}>
                        No branches found for this repository.
                      </Text>
                    ) : (
                      <>
                        <ScrollView style={{ maxHeight: 150 }} nestedScrollEnabled>
                          {branches.map((branch) => (
                            <Pressable
                              key={branch.name}
                              onPress={() => selectBranch(branch.name)}
                              style={({ pressed }) => ({
                                padding: 10,
                                borderRadius: 8,
                                borderWidth: 1,
                                borderColor: selectedBranch === branch.name ? colors.brandLight : colors.border,
                                backgroundColor: selectedBranch === branch.name ? colors.brandSubtle : colors.surfaceElevated,
                                marginBottom: 6,
                                opacity: pressed ? 0.85 : 1,
                              })}
                            >
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Text style={[typography.code, { color: colors.text, fontWeight: '600', fontSize: 12, flex: 1 }]} numberOfLines={1}>
                                  {branch.name}
                                </Text>
                                {branch.isDefault && (
                                  <Text style={[typography.code, { color: colors.brandLight, fontSize: 9, fontWeight: '600' }]}>
                                    DEFAULT
                                  </Text>
                                )}
                              </View>
                            </Pressable>
                          ))}
                        </ScrollView>
                        <Pressable
                          onPress={() => setShowBranchInput(!showBranchInput)}
                          style={({ pressed }) => ({
                            padding: 10,
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: colors.border,
                            backgroundColor: colors.surfaceElevated,
                            opacity: pressed ? 0.85 : 1,
                          })}
                        >
                          <Text style={[typography.caption, { color: colors.brandLight, textAlign: 'center' }]}>
                            {showBranchInput ? 'Cancel' : 'Enter branch manually'}
                          </Text>
                        </Pressable>
                        {showBranchInput && (
                          <View style={{ gap: 6 }}>
                            <TextInput
                              accessibilityLabel="Enter branch name"
                              value={branchInput}
                              onChangeText={setBranchInput}
                              placeholder="Enter branch name..."
                              placeholderTextColor={colors.textMuted}
                              autoCapitalize="none"
                              autoCorrect={false}
                              style={input}
                            />
                            <Button title="Confirm branch" onPress={submitBranchInput} variant="secondary" />
                          </View>
                        )}
                      </>
                    )}
                  </View>
                )}

                {mode === 'code_fix' && (
                  <TextInput
                    accessibilityLabel="Coding base branch (optional)"
                    value={baseBranch}
                    editable={!busy}
                    onChangeText={(value) => {
                      setBaseBranch(value);
                      resetDraft();
                    }}
                    maxLength={160}
                    placeholder="Base branch (optional; repository default otherwise)"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={input}
                  />
                )}
                {!!targetText && !target && (
                  <Text accessibilityRole="alert" style={[typography.caption, { color: colors.riskHigh }]}>
                    Use a direct HTTPS GitHub repository, issue or PR link without a query or fragment.
                  </Text>
                )}
                {!!target && !targetCompatible && !isRepoOnly && (
                  <Text accessibilityRole="alert" style={[typography.caption, { color: colors.riskHigh }]}>
                    Review workflows need a PR. Choose Prepare a fix for an issue or repository task.
                  </Text>
                )}
                {isRepoOnly && mode === 'review' && selectedPr === null && (
                  <Text accessibilityRole="alert" style={[typography.caption, { color: colors.riskHigh }]}>
                    Select a pull request from the list above.
                  </Text>
                )}
                {isRepoOnly && mode === 'code_fix' && selectedBranch === null && (
                  <Text accessibilityRole="alert" style={[typography.caption, { color: colors.riskHigh }]}>
                    Select a branch or enter one manually.
                  </Text>
                )}
                <Button
                  title="Create workflow"
                  loading={workspace.busy === 'plan'}
                  disabled={!workspace.configured || !targetCompatible || intent.trim().length < 3 || !consentReady || busy}
                  onPress={generate}
                />
                {!consentReady && (
                  <View style={{ gap: 6 }}>
                    <Text style={[typography.caption, { color: colors.textSecondary }]}>
                      Model generation and execution require your current AI consent. Templates can be inspected without running a model.
                    </Text>
                    <Button title="Review AI preferences" variant="secondary" onPress={() => router.push('/(auth)/consent')} />
                  </View>
                )}
              </View>

              {definition && !workspace.selectedRun && (
                <View style={{ flex: isDesktop ? 5 : undefined }}>
                  <WorkflowPlanCard
                    definition={definition}
                  />
                </View>
              )}
            </View>

            {!!(localError || workspace.error) && (
              <ErrorState
                title="Workflow needs attention"
                message={localError || workspace.error}
                onRetry={() => {
                  setLocalError('');
                  workspace.clearError();
                  workspace.refresh();
                }}
                retryLabel="Refresh capabilities"
              />
            )}
            {!!workspace.error && !localError && (
              <CopyDetailsButton report={{ at: new Date(), ...(workspace.errorInfo ?? {}), message: workspace.error, runId: workspace.selectedRun?.id }} />
            )}

            {workspace.selectedRun ? (
              <View ref={runPanelRef} style={{ gap: 14 }}>
                <Button title="Back to workflow builder" variant="ghost" disabled={busy} onPress={workspace.clearRun} />
                <AgentRunPanel
                  run={workspace.selectedRun}
                  cancelling={workspace.busy === 'cancel'}
                  passkeyBusy={workspace.busy==='register_passkey'||workspace.busy==='approve_patch'}
                  passkeysAvailable={workspace.passkeysAvailable}
                  proposal={workspace.patchProposal}
                  onCancel={() => void workspace.cancel()}
                  onRetry={retry}
                  onRegisterPasskey={()=>void workspace.registerPasskey()}
                  onApprovePatch={()=>void workspace.approvePatch()}
                  onOpenWebApproval={()=>void Linking.openURL(workflowApprovalUrl(webAppOrigin(apiMode),workspace.selectedRun!.id))}
                />
                {!isRunActive(workspace.selectedRun.status) && (
                  <Button title="Use this workflow again" variant="secondary" disabled={busy} onPress={retry} />
                )}
              </View>
            ) : definition ? (
              <View style={{ gap: 12 }}>
                <View style={[surface, { gap: 10 }]}>
                  <Text style={[typography.caption, { color: colors.textSecondary, fontWeight: '600' }]}>
                    WORKFLOW NAME & GRAPH CONTROLS
                  </Text>
                  <TextInput
                    accessibilityLabel="Workflow name"
                    value={definition.name}
                    editable={!busy}
                    maxLength={80}
                    onChangeText={(name) => setDefinition({ ...definition, name })}
                    style={[input, { fontSize: 16, fontWeight: '700' }]}
                  />
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>
                    Edit the graph before starting. Required dependencies stay ordered.
                  </Text>
                </View>

                {/* Desktop Side-by-Side Visual Graph + Step Inspector vs Mobile Stack */}
                <View style={{ flexDirection: isDesktop && selectedStepIndex !== null ? 'row' : 'column', gap: 14, alignItems: 'flex-start' }}>
                  <View style={{ flex: isDesktop && selectedStepIndex !== null ? 7 : undefined, width: '100%' }}>
                    <WorkflowCanvas
                      definition={definition}
                      selectedStepIndex={selectedStepIndex}
                      busy={busy}
                      onSelectStep={(idx) => setSelectedStepIndex((prev) => (prev === idx ? null : idx))}
                      onChangeDefinition={changeDefinition}
                    />
                  </View>
                  {selectedStepIndex !== null && (
                    <View style={{ flex: isDesktop ? 5 : undefined, width: '100%' }}>
                      <WorkflowNodeInspector
                        definition={definition}
                        stepIndex={selectedStepIndex}
                        busy={busy}
                        onChangeDefinition={changeDefinition}
                        onClose={() => setSelectedStepIndex(null)}
                      />
                    </View>
                  )}
                </View>

                {confirmRequired(definition) && (
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityLabel="Authorize coding workflow changes and draft PR"
                    accessibilityState={{ checked: confirmCodeChanges, disabled: busy }}
                    aria-checked={confirmCodeChanges}
                    disabled={busy}
                    onPress={() => setConfirmCodeChanges((value) => !value)}
                    style={[surface, { minHeight: 56, flexDirection: 'row', gap: 10, alignItems: 'flex-start' }]}
                  >
                    <Icon name={confirmCodeChanges ? 'checkbox' : 'square-outline'} size={20} color={colors.brandLight} />
                    <Text style={[typography.footnote, { flex: 1, color: colors.textSecondary }]}>
                      I authorize this run to prepare changes, execute the configured isolated tests, and create a branch, commit and draft PR in this repository if tests pass and write permissions permit it. This does not authorize merging or releasing.
                    </Text>
                  </Pressable>
                )}

                {!target && (
                  <Text style={[typography.caption, { color: colors.brandLight }]}>
                    Choose a GitHub {definition.mode === 'review' ? 'pull request' : 'issue, repository or pull request'} target above to check capabilities, save or run.
                  </Text>
                )}
                {!!target && !capability?.available && (
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>
                    {capability?.reason ?? 'Execution stays disabled until the API confirms the required runtime and repository capabilities.'}
                  </Text>
                )}

                {/* Mexas Bottom Dual-Action Bar: Save/Publish + Run Automation */}
                <View
                  style={[
                    surface,
                    // Phones stack the actions full width so Save and Run never overlap.
                    isDesktop
                      ? { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }
                      : { flexDirection: 'column', gap: 10, alignItems: 'stretch' },
                  ]}
                >
                  <View style={isDesktop ? { flexDirection: 'row', gap: 8, flexWrap: 'wrap', flex: 1 } : { flexDirection: 'column', gap: 10, alignItems: 'stretch' }}>
                    <Button
                      title={definition.id ? 'Save changes' : 'Save workflow'}
                      accessibilityLabel="Save workflow"
                      variant="secondary"
                      loading={workspace.busy === 'save'}
                      disabled={!workspace.configured || !targetCompatible || !target || !sameTarget(definition.target, target) || busy || workspace.definitionsLoading || !DefinitionSchema.safeParse(definition).success}
                      onPress={() => openSaveSheet()}
                    />
                    {definition.id && (
                      <Button
                        title="Save as a new workflow"
                        variant="ghost"
                        disabled={!workspace.configured || !targetCompatible || !target || !sameTarget(definition.target, target) || busy || workspace.definitionsLoading}
                        onPress={() => openSaveSheet(true)}
                      />
                    )}
                  </View>
                  <Button
                    title={definition.mode === 'code_fix' ? 'Run coding workflow' : 'Run review workflow'}
                    loading={workspace.busy === 'start'}
                    disabled={!canRun || !DefinitionSchema.safeParse(definition).success}
                    onPress={() => workspace.start(definition, confirmCodeChanges)}
                    style={isDesktop ? { flexGrow: 1 } : { width: '100%' }}
                  />
                </View>

                <Text style={[typography.caption, { color: colors.textSecondary }]}>
                  A workflow graph is a plan, not an execution receipt. Runs are processed by the configured backend; existing GitHub checks and tests executed by the coding runner are reported separately.
                </Text>
              </View>
            ) : (
              <EmptyState
                icon="git-network-outline"
                title="Your next workflow starts here"
                message="Choose a target, describe the task and create a workflow, or start from a template."
              />
            )}
          </View>
        </View>

            {/* Bento Cell 2: Connected Capabilities */}
            <View style={[surface, { gap: 8 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text accessibilityRole="header" style={[typography.headline, { color: colors.text }]}>
                  Connected capabilities
                </Text>
                <InfoTip
                  title="Connected Capabilities"
                  body="Shows live repository permissions and backend execution readiness. Review workflows require GitHub read access + AI consent; coding workflows also require an isolated executor and repository write scope."
                  size={15}
                />
              </View>
              {workspace.capabilityLoading ? (
                <Text style={[typography.caption, { color: colors.textSecondary }]}>Checking this repository...</Text>
              ) : workspace.capabilityError ? (
                <Text accessibilityRole="alert" style={[typography.caption, { color: colors.statusAlert }]}>
                  {workspace.capabilityError}
                </Text>
              ) : workspace.capabilities ? (
                <>
                  <CapabilityLine
                    title="Analysis runtime"
                    available={workspace.capabilities.analysis.available}
                    reason={workspace.capabilities.analysis.reason}
                  />
                  {codingEnabled && (
                    <CapabilityLine
                      title="Coding executor"
                      available={workspace.capabilities.coding.available}
                      reason={workspace.capabilities.coding.reason}
                    />
                  )}
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>
                    Limits: {workspace.capabilities.limits.maxFiles} changed files · {workspace.capabilities.limits.maxSteps} workflow steps
                  </Text>
                </>
              ) : (
                <Text style={[typography.caption, { color: colors.textSecondary }]}>
                  Add a repository target to check the actual model, queue and executor configuration.
                </Text>
              )}
              <Text style={[typography.caption, { color: colors.textSecondary }]}>
                Coding needs a configured isolated executor and repository write authorization. Existing connection scopes are not silently expanded.
              </Text>
              <Button title="Manage workspace connections" variant="ghost" onPress={() => router.push('/(tabs)/settings')} />
            </View>

      </ScrollView>

      <Modal visible={!!saveSheet} transparent animationType="slide" onRequestClose={() => setSaveSheet(null)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' }}>
          <View accessibilityViewIsModal style={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, gap: 12, width: '100%', maxWidth: 560, alignSelf: 'center' }}>
            <Text accessibilityRole="header" style={[typography.headline, { color: colors.text }]}>
              {saveSheet?.copy ? 'Save as a new workflow' : definition?.id ? 'Save changes' : 'Save workflow'}
            </Text>
            <Text style={[typography.footnote, { color: colors.textSecondary }]}>Name</Text>
            <TextInput
              accessibilityLabel="Workflow name"
              value={saveSheet?.name ?? ''}
              maxLength={80}
              autoFocus
              onChangeText={(name) => setSaveSheet((old) => (old ? { ...old, name, error: '' } : old))}
              style={{ minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, color: colors.text, backgroundColor: colors.background }}
            />
            <Text style={[typography.footnote, { color: colors.textSecondary }]}>Description (optional)</Text>
            <TextInput
              accessibilityLabel="Workflow description"
              value={saveSheet?.description ?? ''}
              maxLength={SAVE_DESCRIPTION_MAX}
              multiline
              onChangeText={(description) => setSaveSheet((old) => (old ? { ...old, description, error: '' } : old))}
              style={{ minHeight: 72, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, color: colors.text, backgroundColor: colors.background, textAlignVertical: 'top' }}
            />
            {!!saveSheet?.error && (
              <Text accessibilityRole="alert" style={[typography.footnote, { color: colors.statusAlert }]}>{saveSheet.error}</Text>
            )}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button title="Cancel" variant="ghost" disabled={workspace.busy === 'save'} onPress={() => setSaveSheet(null)} style={{ flexGrow: 1, flexBasis: 0 }} />
              <Button title="Save" loading={workspace.busy === 'save'} disabled={busy} onPress={() => void saveWorkflow()} style={{ flexGrow: 1, flexBasis: 0 }} />
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={targetModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setTargetModalOpen(false)}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close target selector"
          onPress={() => setTargetModalOpen(false)}
          style={{
            flex: 1,
            backgroundColor: 'rgba(11, 15, 23, 0.72)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation?.()}
            style={{
              width: '100%',
              maxWidth: 460,
              maxHeight: 420,
              backgroundColor: colors.surface,
              borderRadius: radius.lg,
              borderWidth: 1,
              borderColor: colors.brandMuted,
              padding: 16,
              gap: 10,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text accessibilityRole="header" style={[typography.headline, { color: colors.text }]}>
                Select PR or Repository
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close modal"
                onPress={() => setTargetModalOpen(false)}
                style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}
              >
                <Icon name="close" size={18} color={colors.textSecondary} />
              </Pressable>
            </View>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>
              Choose an open pull request or watched repository from your connected projects.
            </Text>
            {!!projectTargetsError && (
              <ErrorState
                title="Some projects could not be loaded"
                message={projectTargetsError}
                onRetry={() => void loadProjectTargets()}
                retryLabel="Reload projects"
              />
            )}
            <ScrollView style={{ maxHeight: 300 }} contentContainerStyle={{ gap: 6 }}>
              {projectTargetsLoading ? (
                <LoadingState title="Loading projects..." message="Checking open pull requests and watched repositories." />
              ) : projectTargets.length === 0 ? (
                <Text style={[typography.caption, { color: colors.textSecondary, paddingVertical: 12 }]}>
                  No active pull requests or watched repositories loaded yet.
                </Text>
              ) : (
                projectTargets.map((option) => {
                  const selected = targetText === option.url;
                  return (
                    <Pressable
                      key={option.url}
                      accessibilityRole="button"
                      accessibilityLabel={`Select ${option.label}`}
                      onPress={() => {
                        setTargetText(option.url);
                        const nextParsed = targetFromUrl(option.url);
                        if (definition && nextParsed) {
                          const nextMode: AgentMode =
                            codingEnabled && definition.mode === 'review' && (nextParsed.kind ?? 'pull_request') !== 'pull_request'
                              ? 'code_fix'
                              : definition.mode;
                          setMode(nextMode);
                          const nextTarget = TargetSchema.safeParse({
                            ...nextParsed,
                            ...(nextMode === 'code_fix' && baseBranch.trim() ? { baseBranch: baseBranch.trim() } : {}),
                          });
                          if (nextTarget.success) {
                            setDefinition({ ...definition, mode: nextMode, target: nextTarget.data });
                            setConfirmCodeChanges(false);
                            setLocalError('');
                          }
                        }
                        setTargetModalOpen(false);
                      }}
                      style={({ pressed }) => ({
                        padding: 10,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: selected ? colors.brandLight : colors.border,
                        backgroundColor: selected ? colors.brandSubtle : colors.surfaceElevated,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10,
                        opacity: pressed ? 0.85 : 1,
                      })}
                    >
                      <Icon
                        name={option.kind === 'repo' ? 'folder-outline' : 'git-pull-request-outline'}
                        size={16}
                        color={selected ? colors.brandLight : colors.textSecondary}
                      />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[typography.caption, { color: colors.text, fontWeight: '700' }]} numberOfLines={1}>
                          {option.label}
                        </Text>
                        <Text style={[typography.caption, { color: colors.textSecondary }]} numberOfLines={1}>
                          {option.sublabel}
                        </Text>
                      </View>
                      {selected && <Icon name="checkmark-circle" size={16} color={colors.statusGood} />}
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function confirmRequired(definition: WorkflowDefinition) {
  return definition.mode === 'code_fix';
}
function targetUrl(definition: WorkflowDefinition) {
  const t = definition.target;
  const root = `https://github.com/${t.owner}/${t.repo}`;
  return (t.kind ?? 'pull_request') === 'repository'
    ? root
    : `${root}/${t.kind === 'issue' ? 'issues' : 'pull'}/${t.number}`;
}
function CapabilityLine({ title, available, reason }: { title: string; available: boolean; reason?: string }) {
  const { colors, typography } = useTheme();
  return (
    <View style={{ gap: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon
          name={available ? 'checkmark-circle-outline' : 'alert-circle-outline'}
          size={15}
          color={available ? colors.statusGood : colors.statusWarning}
        />
        <Text style={[typography.caption, { color: available ? colors.statusGood : colors.statusWarning, fontWeight: '700' }]}>
          {title}: {available ? 'Ready' : 'Needs setup'}
        </Text>
      </View>
      {!!reason && <Text style={[typography.caption, { color: colors.textSecondary }]}>{reason}</Text>}
    </View>
  );
}

function withoutId(definition: WorkflowDefinition): WorkflowDefinition {
  const { id: _id, ...draft } = definition;
  return draft;
}
