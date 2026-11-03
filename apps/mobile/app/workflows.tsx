import React, { useMemo, useRef, useState } from 'react';
import { View, ScrollView, Pressable, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { WorkflowDefinition } from '@mergemate/contracts';
import { WorkflowDefinition as DefinitionSchema, WorkflowTarget as TargetSchema } from '@mergemate/contracts';
import { useAuth } from '../src/context/AuthContext';
import { useConsent } from '../src/context/ConsentContext';
import { useTheme } from '../src/context/ThemeContext';
import { useLayout } from '../src/layout/useLayout';
import { Text } from '../src/components/Text';
import { Header } from '../src/components/Header';
import { Icon, type IconName } from '../src/components/Icon';
import { Button } from '../src/components/Button';
import { EmptyState } from '../src/components/EmptyState';
import { LoadingState } from '../src/components/LoadingState';
import { ErrorState } from '../src/components/ErrorState';
import { AgentRunPanel } from '../src/workflows/AgentRunPanel';
import { WorkflowCanvas } from '../src/workflows/WorkflowCanvas';
import { WorkflowNodeInspector } from '../src/workflows/WorkflowNodeInspector';
import { WorkflowPlanCard } from '../src/workflows/WorkflowPlanCard';
import { useAgentWorkspace } from '../src/workflows/useAgentWorkspace';
import {
  AGENT_TEMPLATES,
  makeAgentTemplate,
  targetFromUrl,
  displayRunStatus,
  sameTarget,
  isRunActive,
  type AgentMode,
} from '../src/workflows/agent-model';

export default function AgentWorkflowsScreen() {
  const { user, isDemo } = useAuth();
  const params = useLocalSearchParams<{ target?: string; mode?: string }>();
  const target = typeof params.target === 'string' && targetFromUrl(params.target) ? params.target : '';
  const mode: AgentMode = params.mode === 'code_fix' ? 'code_fix' : 'review';
  return user ? (
    <AgentWorkspace key={`${user.id}:${target}:${mode}`} account={user.id} isDemo={isDemo} initialTarget={target} initialMode={mode} />
  ) : (
    <LoadingState title="Checking your session..." message="Workflow runs belong to your account." />
  );
}

function AgentWorkspace({
  account,
  isDemo,
  initialTarget,
  initialMode,
}: {
  account: string;
  isDemo: boolean;
  initialTarget: string;
  initialMode: AgentMode;
}) {
  const { colors, typography } = useTheme();
  const { isDesktop } = useLayout();
  const { aiConsentGranted, needsReview, pending: consentPending } = useConsent();
  const router = useRouter();
  const [targetText, setTargetText] = useState(initialTarget);
  const [baseBranch, setBaseBranch] = useState('');
  const [mode, setMode] = useState<AgentMode>(initialMode);
  const [intent, setIntent] = useState('');
  const [definition, setDefinition] = useState<WorkflowDefinition | null>(null);
  const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(null);
  const [confirmCodeChanges, setConfirmCodeChanges] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [localError, setLocalError] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const draftVersion = useRef(0);

  const target = useMemo(() => {
    const parsed = targetFromUrl(targetText);
    if (!parsed) return null;
    const value = TargetSchema.safeParse({
      ...parsed,
      ...(mode === 'code_fix' && baseBranch.trim() ? { baseBranch: baseBranch.trim() } : {}),
    });
    return value.success ? value.data : null;
  }, [targetText, baseBranch, mode]);

  const workspace = useAgentWorkspace(account, target, isDemo);
  const busy = workspace.busy !== null;
  const consentReady = aiConsentGranted && !needsReview && !consentPending;
  const targetCompatible = !!target && (mode === 'code_fix' || (target.kind ?? 'pull_request') === 'pull_request');
  const capability = mode === 'code_fix' ? workspace.capabilities?.coding : workspace.capabilities?.analysis;
  const canRun =
    !!definition &&
    !!target &&
    sameTarget(definition.target, target) &&
    !!capability?.available &&
    workspace.configured &&
    consentReady &&
    (!confirmRequired(definition) || confirmCodeChanges) &&
    !busy;

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

  const chooseTemplate = (id: string) => {
    if (busy) return;
    const template = AGENT_TEMPLATES.find((value) => value.id === id)!;
    setMode(template.mode);
    setIntent(template.intent);
    setConfirmCodeChanges(false);
    setSelectedStepIndex(null);
    setLocalError('');
    workspace.clearRun();
    if (!target || (template.mode === 'review' && (target.kind ?? 'pull_request') !== 'pull_request')) {
      setDefinition(null);
      setLocalError(
        template.mode === 'review'
          ? 'Add a GitHub pull request link for this review template.'
          : 'Add a GitHub issue, repository or pull request link.',
      );
      return;
    }
    setDefinition(makeAgentTemplate(id, target));
    draftVersion.current++;
  };

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

  const saveWorkflow = async (copy = false) => {
    if (!definition || busy) return;
    const version = draftVersion.current;
    const inputValue = copy ? { ...withoutId(definition), name: `${definition.name.slice(0, 75)} copy` } : definition;
    setSavedMessage('');
    const value = await workspace.saveDefinition(inputValue);
    if (value && version === draftVersion.current) {
      setDefinition(value);
      setConfirmCodeChanges(false);
      setSavedMessage('Workflow saved to your account.');
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
    const q = searchFilter.trim().toLowerCase();
    if (!q) return AGENT_TEMPLATES;
    return AGENT_TEMPLATES.filter(
      (t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q),
    );
  }, [searchFilter]);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.background }}>
      <Header
        title="Workflows"
        showBack
        rightAction={<Button title="Refresh" variant="ghost" disabled={busy} onPress={workspace.refresh} />}
      />
      <ScrollView
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
              accessibilityLabel="New workflow draft"
              disabled={busy}
              onPress={resetDraft}
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

        {/* Responsive Desktop Bento Grid vs Mobile Stack */}
        <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 16, alignItems: 'flex-start' }}>
          {/* Left Bento Column: Templates, Capabilities, Saved Workflows & Recent Runs */}
          <View style={{ width: isDesktop ? 330 : '100%', gap: 12 }}>
            {/* Bento Cell 1: Starter Workflows (Mexas List Style) */}
            <View style={[surface, { gap: 10 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text accessibilityRole="header" style={[typography.headline, { color: colors.text }]}>
                  Start with a workflow
                </Text>
                <Text style={[typography.caption, { color: colors.brandLight }]}>{filteredTemplates.length} templates</Text>
              </View>
              {filteredTemplates.map((template) => {
                const active = definition?.name === template.name;
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
                    <Text numberOfLines={2} style={[typography.caption, { color: colors.textSecondary }]}>
                      {template.description}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Bento Cell 2: Connected Capabilities */}
            <View style={[surface, { gap: 8 }]}>
              <Text accessibilityRole="header" style={[typography.headline, { color: colors.text }]}>
                Connected capabilities
              </Text>
              {workspace.capabilityLoading ? (
                <Text style={[typography.caption, { color: colors.textSecondary }]}>Checking this repository...</Text>
              ) : workspace.capabilityError ? (
                <Text accessibilityRole="alert" style={[typography.caption, { color: colors.riskHigh }]}>
                  {workspace.capabilityError}
                </Text>
              ) : workspace.capabilities ? (
                <>
                  <CapabilityLine
                    title="Analysis runtime"
                    available={workspace.capabilities.analysis.available}
                    reason={workspace.capabilities.analysis.reason}
                  />
                  <CapabilityLine
                    title="Coding executor"
                    available={workspace.capabilities.coding.available}
                    reason={workspace.capabilities.coding.reason}
                  />
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

            {/* Bento Cell 3: Saved Workflows */}
            <View style={[surface, { gap: 8 }]}>
              <Text accessibilityRole="header" style={[typography.headline, { color: colors.text }]}>
                Saved workflows
              </Text>
              {workspace.definitionsLoading ? (
                <Text style={[typography.caption, { color: colors.textSecondary }]}>Loading saved workflows...</Text>
              ) : workspace.definitionsError ? (
                <Text accessibilityRole="alert" style={[typography.caption, { color: colors.riskHigh }]}>
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
                      backgroundColor: colors.surfaceElevated,
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
            <View style={[surface, { gap: 8 }]}>
              <Text accessibilityRole="header" style={[typography.headline, { color: colors.text }]}>
                Recent runs
              </Text>
              {workspace.historyLoading ? (
                <Text style={[typography.caption, { color: colors.textSecondary }]}>Loading runs...</Text>
              ) : workspace.historyError ? (
                <Text accessibilityRole="alert" style={[typography.caption, { color: colors.riskHigh }]}>
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

          {/* Right Bento Workspace: Prompt Builder, AI Plan Card, Visual Node Canvas & Inspector */}
          <View style={{ flex: 1, width: '100%', minWidth: 0, gap: 14 }}>
            {/* Top Bento Row: Prompt Composer + Conversational AI Plan Card */}
            <View style={{ flexDirection: isDesktop && definition ? 'row' : 'column', gap: 14, alignItems: 'stretch' }}>
              <View style={[surface, { flex: isDesktop && definition ? 6 : undefined, backgroundColor: colors.brandSubtle, borderColor: colors.brandMuted, gap: 10 }]}>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  <Icon name="sparkles-outline" size={16} color={colors.brandLight} />
                  <Text style={[typography.code, { color: colors.brandLight, fontSize: 10, letterSpacing: 1 }]}>
                    WHAT WOULD YOU LIKE TO AUTOMATE TODAY?
                  </Text>
                </View>
                <TextInput
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
                <View style={{ flexDirection: 'row', gap: 8 }} accessibilityRole="radiogroup">
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
                </View>
                <TextInput
                  accessibilityLabel="GitHub workflow target URL"
                  value={targetText}
                  editable={!busy}
                  onChangeText={(value) => {
                    setTargetText(value);
                    resetDraft();
                  }}
                  maxLength={400}
                  placeholder={
                    mode === 'review'
                      ? 'https://github.com/owner/repo/pull/123'
                      : 'GitHub issue, repository or pull request URL'
                  }
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  style={input}
                />
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
                {!!target && !targetCompatible && (
                  <Text accessibilityRole="alert" style={[typography.caption, { color: colors.riskHigh }]}>
                    Review workflows need a PR. Choose Prepare a fix for an issue or repository task.
                  </Text>
                )}
                <Button
                  title="Generate workflow"
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
                    onInspectCanvas={() => setSelectedStepIndex((prev) => (prev === null ? 0 : prev))}
                  />
                </View>
              )}
            </View>

            {!!savedMessage && (
              <Text accessibilityLiveRegion="polite" style={[typography.footnote, { color: colors.brandLight }]}>
                {savedMessage}
              </Text>
            )}
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

            {workspace.selectedRun ? (
              <>
                <Button title="Back to workflow builder" variant="ghost" disabled={busy} onPress={workspace.clearRun} />
                <AgentRunPanel
                  run={workspace.selectedRun}
                  cancelling={workspace.busy === 'cancel'}
                  onCancel={() => void workspace.cancel()}
                  onRetry={retry}
                />
                {!isRunActive(workspace.selectedRun.status) && (
                  <Button title="Use this workflow again" variant="secondary" disabled={busy} onPress={retry} />
                )}
              </>
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

                {!capability?.available && (
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>
                    {capability?.reason ?? 'Execution stays disabled until the API confirms the required runtime and repository capabilities.'}
                  </Text>
                )}

                {/* Mexas Bottom Dual-Action Bar: Save/Publish + Run Automation */}
                <View
                  style={[
                    surface,
                    {
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      gap: 10,
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    },
                  ]}
                >
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', flex: 1 }}>
                    <Button
                      title={definition.id ? 'Save changes' : 'Save workflow'}
                      accessibilityLabel="Save workflow"
                      variant="secondary"
                      loading={workspace.busy === 'save'}
                      disabled={!workspace.configured || busy || workspace.definitionsLoading || !DefinitionSchema.safeParse(definition).success}
                      onPress={() => saveWorkflow()}
                    />
                    {definition.id && (
                      <Button
                        title="Save as a new workflow"
                        variant="ghost"
                        disabled={!workspace.configured || busy || workspace.definitionsLoading}
                        onPress={() => saveWorkflow(true)}
                      />
                    )}
                  </View>
                  <Button
                    title={definition.mode === 'code_fix' ? 'Run coding workflow' : 'Run review workflow'}
                    loading={workspace.busy === 'start'}
                    disabled={!canRun || !DefinitionSchema.safeParse(definition).success}
                    onPress={() => workspace.start(definition, confirmCodeChanges)}
                    style={{ flexGrow: 1 }}
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
                message="Describe a task and generate a workflow, or choose a template to inspect and edit its steps."
              />
            )}
          </View>
        </View>
      </ScrollView>
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
          name={available ? 'checkmark-circle-outline' : 'ellipse-outline'}
          size={15}
          color={available ? colors.riskLow : colors.textSecondary}
        />
        <Text style={[typography.caption, { color: colors.text, fontWeight: '600' }]}>
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
