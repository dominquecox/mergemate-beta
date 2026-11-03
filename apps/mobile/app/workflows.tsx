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
import { useAgentWorkspace } from '../src/workflows/useAgentWorkspace';
import { AGENT_TEMPLATES, AGENT_STEP_META, makeAgentTemplate, moveAgentStep, toggleAgentStep, targetFromUrl, displayRunStatus, sameTarget, type AgentMode } from '../src/workflows/agent-model';

export default function AgentWorkflowsScreen() {
  const { user, isDemo } = useAuth();
  const params = useLocalSearchParams<{ target?: string; mode?: string }>();
  const target = typeof params.target === 'string' && targetFromUrl(params.target) ? params.target : '';
  const mode: AgentMode = params.mode === 'code_fix' ? 'code_fix' : 'review';
  return user ? <AgentWorkspace key={`${user.id}:${target}:${mode}`} account={user.id} isDemo={isDemo} initialTarget={target} initialMode={mode} /> : <LoadingState title="Checking your session..." message="Workflow runs belong to your account." />;
}
function AgentWorkspace({ account, isDemo, initialTarget, initialMode }: { account: string; isDemo: boolean; initialTarget: string; initialMode: AgentMode }) {
  const { colors, typography } = useTheme();
  const { isDesktop } = useLayout();
  const { aiConsentGranted, needsReview, pending: consentPending } = useConsent();
  const router = useRouter();
  const [targetText, setTargetText] = useState(initialTarget);
  const [baseBranch, setBaseBranch] = useState('');
  const [mode, setMode] = useState<AgentMode>(initialMode);
  const [intent, setIntent] = useState('');
  const [definition, setDefinition] = useState<WorkflowDefinition | null>(null);
  const [confirmCodeChanges, setConfirmCodeChanges] = useState(false);
  const [localError, setLocalError] = useState('');
  const draftVersion = useRef(0);
  const target = useMemo(() => {
    const parsed = targetFromUrl(targetText);
    if (!parsed) return null;
    const value = TargetSchema.safeParse({ ...parsed, ...(mode === 'code_fix' && baseBranch.trim() ? { baseBranch: baseBranch.trim() } : {}) });
    return value.success ? value.data : null;
  }, [targetText, baseBranch, mode]);
  const workspace = useAgentWorkspace(account, target, isDemo);
  const busy = workspace.busy !== null;
  const consentReady = aiConsentGranted && !needsReview && !consentPending;
  const targetCompatible = !!target && (mode === 'code_fix' || (target.kind ?? 'pull_request') === 'pull_request');
  const capability = mode === 'code_fix' ? workspace.capabilities?.coding : workspace.capabilities?.analysis;
  const canRun = !!definition && !!target && sameTarget(definition.target, target) && !!capability?.available && workspace.configured && consentReady && (!confirmRequired(definition) || confirmCodeChanges) && !busy;
  const surface = { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 22, padding: 20 };
  const input = { minHeight: 48, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.borderLight, color: colors.text, backgroundColor: colors.surfaceElevated, fontFamily: typography.body.fontFamily };
  const resetDraft = () => { draftVersion.current++; setDefinition(null); setConfirmCodeChanges(false); setLocalError(''); workspace.clearError(); workspace.clearRun(); };
  const chooseTemplate = (id: string) => {
    if (busy) return;
    const template = AGENT_TEMPLATES.find(value => value.id === id)!;
    setMode(template.mode); setIntent(template.intent); setConfirmCodeChanges(false); setLocalError(''); workspace.clearRun();
    if (!target || (template.mode === 'review' && (target.kind ?? 'pull_request') !== 'pull_request')) {
      setDefinition(null); setLocalError(template.mode === 'review' ? 'Add a GitHub pull request link for this review template.' : 'Add a GitHub issue, repository or pull request link.'); return;
    }
    setDefinition(makeAgentTemplate(id, target)); draftVersion.current++;
  };
  const generate = async () => {
    if (!targetCompatible || !consentReady) return;
    const version = ++draftVersion.current; setLocalError(''); setConfirmCodeChanges(false); workspace.clearRun();
    const value = await workspace.generate(intent.trim(), mode);
    if (value && version === draftVersion.current) {
      if (value.mode !== mode || !target || !sameTarget(value.target, target)) { setLocalError('Generated workflow did not match the requested target and mode. Generate again.'); return; }
      setDefinition(value); setIntent(value.intent);
    }
  };
  const changeDefinition = (next: WorkflowDefinition | null) => {
    if (busy) return;
    if (!next) { setLocalError('That edit would break a required dependency. Keep context first, then patch, tests and draft PR in order for coding runs.'); return; }
    setLocalError(''); setDefinition(next); setConfirmCodeChanges(false);
  };
  const retry = () => {
    const run = workspace.selectedRun; if (!run || busy) return;
    const d = run.definition; setTargetText(targetUrl(d)); setBaseBranch(d.target.baseBranch ?? ''); setMode(d.mode); setIntent(d.intent); setDefinition(d); setConfirmCodeChanges(false); setLocalError(''); workspace.clearRun();
  };
  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.background }}>
    <Header title="Agent workspace" showBack rightAction={<Button title="Refresh" variant="ghost" disabled={busy} onPress={workspace.refresh} />} />
    <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={{ padding: isDesktop ? 28 : 16, paddingBottom: 48, gap: 24 }}>
      <View style={{ gap: 10 }}>
        <Text style={[typography.code, { color: colors.brandLight, fontSize: 11, letterSpacing: 1.3 }]}>FROM INTENT TO EXECUTION</Text>
        <Text accessibilityRole="header" style={[typography.largeTitle, { color: colors.text, maxWidth: 700 }]}>Put your agents to work.</Text>
        <Text style={[typography.body, { color: colors.textSecondary, maxWidth: 620 }]}>Describe the outcome. Shape the workflow. Follow every step and inspect the evidence it produces.</Text>
      </View>
      {!workspace.configured && <View style={[surface, { gap: 8, borderColor: colors.brandMuted }]}><Text style={[typography.headline, { color: colors.text }]}>Explore the builder</Text><Text style={[typography.footnote, { color: colors.textSecondary }]}>Templates are available here. Real model generation and runs require a signed-in connection to the workflow API; demo mode does not simulate agent execution.</Text></View>}
      <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 24, alignItems: 'flex-start' }}>
        <View style={{ width: isDesktop ? 300 : '100%', gap: 14 }}>
          <Text accessibilityRole="header" style={[typography.headline, { color: colors.text }]}>Start with a workflow</Text>
          {AGENT_TEMPLATES.map(template => <Pressable key={template.id} accessibilityRole="button" accessibilityLabel={`Use ${template.name} template`} disabled={busy} onPress={() => chooseTemplate(template.id)} style={({ pressed }) => [surface, { padding: 16, opacity: pressed ? 0.8 : 1, borderColor: definition?.name === template.name ? colors.brandLight : colors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: colors.brandSubtle, justifyContent: 'center', alignItems: 'center' }}><Icon name={template.icon as IconName} size={21} color={colors.brandLight} /></View><View style={{ flex: 1 }}><Text style={[typography.subhead, { color: colors.text, fontWeight: '700' }]}>{template.name}</Text><Text style={[typography.caption, { color: colors.brandLight, marginTop: 3 }]}>{template.mode === 'review' ? 'REVIEW AGENT' : 'CODING AGENT'}</Text></View></View>
            <Text style={[typography.footnote, { color: colors.textSecondary, marginTop: 12 }]}>{template.description}</Text>
          </Pressable>)}
          <View style={[surface, { padding: 16, gap: 10 }]}>
            <Text accessibilityRole="header" style={[typography.headline, { color: colors.text }]}>Connected capabilities</Text>
            {workspace.capabilityLoading ? <Text style={[typography.footnote, { color: colors.textSecondary }]}>Checking this repository...</Text> : workspace.capabilityError ? <Text accessibilityRole="alert" style={[typography.footnote, { color: colors.riskHigh }]}>{workspace.capabilityError}</Text> : workspace.capabilities ? <>
              <CapabilityLine title="Analysis runtime" available={workspace.capabilities.analysis.available} reason={workspace.capabilities.analysis.reason} />
              <CapabilityLine title="Coding executor" available={workspace.capabilities.coding.available} reason={workspace.capabilities.coding.reason} />
              <Text style={[typography.caption, { color: colors.textSecondary }]}>Limits: {workspace.capabilities.limits.maxFiles} changed files · {workspace.capabilities.limits.maxSteps} workflow steps</Text>
            </> : <Text style={[typography.footnote, { color: colors.textSecondary }]}>Add a repository target to check the actual model, queue and executor configuration.</Text>}
            <Text style={[typography.caption, { color: colors.textSecondary }]}>Coding needs a configured isolated executor and repository write authorization. Existing connection scopes are not silently expanded.</Text>
          </View>
          <View style={{ gap: 8 }}><Text accessibilityRole="header" style={[typography.headline, { color: colors.text }]}>Recent runs</Text>
            {workspace.historyLoading ? <Text style={[typography.footnote, { color: colors.textSecondary }]}>Loading runs...</Text> : workspace.historyError ? <Text accessibilityRole="alert" style={[typography.footnote, { color: colors.riskHigh }]}>{workspace.historyError}</Text> : workspace.runs.length ? workspace.runs.map(run => <Pressable key={run.id} accessibilityRole="button" accessibilityLabel={`Inspect run ${run.definition.name}`} disabled={busy} onPress={() => void workspace.selectRun(run)} style={[surface, { minHeight: 64, padding: 14, gap: 5 }]}><Text numberOfLines={2} style={[typography.subhead, { color: colors.text }]}>{run.definition.name}</Text><Text style={[typography.caption, { color: colors.textSecondary }]}>{displayRunStatus(run.status)}</Text></Pressable>) : <Text style={[typography.footnote, { color: colors.textSecondary }]}>No execution receipts loaded yet.</Text>}
          </View>
        </View>
        <View style={{ flex: 1, width: '100%', minWidth: 0, gap: 16 }}>
          <View style={[surface, { backgroundColor: colors.brandSubtle, borderColor: colors.brandMuted, gap: 14 }]}>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><Icon name="sparkles-outline" size={20} color={colors.brandLight} /><Text style={[typography.caption, { color: colors.brandLight }]}>WHAT WOULD YOU LIKE TO AUTOMATE?</Text></View>
            <TextInput accessibilityLabel="Workflow task" value={intent} editable={!busy} onChangeText={value => { setIntent(value); resetDraft(); }} maxLength={2000} multiline placeholder="Review this PR for risk, or investigate an issue and prepare a tested fix..." placeholderTextColor={colors.textMuted} style={[input, { minHeight: 100, textAlignVertical: 'top', lineHeight: 21 }]} />
            <View style={{ flexDirection: 'row', gap: 8 }} accessibilityRole="radiogroup">
              {(['review','code_fix'] as const).map(value => <Pressable key={value} accessibilityRole="radio" accessibilityLabel={value === 'review' ? 'PR review workflow' : 'Code fix workflow'} accessibilityState={{ checked: mode === value, disabled: busy }} aria-checked={mode === value} disabled={busy} onPress={() => { setMode(value); resetDraft(); }} style={{ flex: 1, minHeight: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center', backgroundColor: mode === value ? colors.brand : colors.surface }}><Text style={[typography.subhead, { color: mode === value ? '#FFFFFF' : colors.text }]}>{value === 'review' ? 'Review a PR' : 'Prepare a fix'}</Text></Pressable>)}
            </View>
            <TextInput accessibilityLabel="GitHub workflow target URL" value={targetText} editable={!busy} onChangeText={value => { setTargetText(value); resetDraft(); }} maxLength={400} placeholder={mode === 'review' ? 'https://github.com/owner/repo/pull/123' : 'GitHub issue, repository or pull request URL'} placeholderTextColor={colors.textMuted} autoCapitalize="none" autoCorrect={false} keyboardType="url" style={input} />
            {mode === 'code_fix' && <TextInput accessibilityLabel="Coding base branch (optional)" value={baseBranch} editable={!busy} onChangeText={value => { setBaseBranch(value); resetDraft(); }} maxLength={160} placeholder="Base branch (optional; repository default otherwise)" placeholderTextColor={colors.textMuted} autoCapitalize="none" autoCorrect={false} style={input} />}
            {!!targetText && !target && <Text accessibilityRole="alert" style={[typography.caption, { color: colors.riskHigh }]}>Use a direct HTTPS GitHub repository, issue or PR link without a query or fragment.</Text>}
            {!!target && !targetCompatible && <Text accessibilityRole="alert" style={[typography.caption, { color: colors.riskHigh }]}>Review workflows need a PR. Choose Prepare a fix for an issue or repository task.</Text>}
            <Button title="Generate workflow" loading={workspace.busy === 'plan'} disabled={!workspace.configured || !targetCompatible || intent.trim().length < 3 || !consentReady || busy} onPress={generate} />
            {!consentReady && <View style={{ gap: 8 }}><Text style={[typography.footnote, { color: colors.textSecondary }]}>Model generation and execution require your current AI consent. Templates can be inspected without running a model.</Text><Button title="Review AI preferences" variant="secondary" onPress={() => router.push('/(auth)/consent')} /></View>}
          </View>
          {!!(localError || workspace.error) && <ErrorState title="Workflow needs attention" message={localError || workspace.error} onRetry={() => { setLocalError(''); workspace.clearError(); workspace.refresh(); }} retryLabel="Refresh capabilities" />}
          {workspace.selectedRun ? <><Button title="Back to workflow builder" variant="ghost" disabled={busy} onPress={workspace.clearRun} /><AgentRunPanel run={workspace.selectedRun} cancelling={workspace.busy === 'cancel'} onCancel={() => void workspace.cancel()} onRetry={retry} /></> : definition ? <View style={{ gap: 14 }}>
            <TextInput accessibilityLabel="Workflow name" value={definition.name} editable={!busy} maxLength={80} onChangeText={name => setDefinition({ ...definition, name })} style={[input, { fontSize: 20, fontWeight: '600' }]} />
            <Text style={[typography.caption, { color: colors.textSecondary }]}>Edit the graph before starting. Required dependencies stay ordered.</Text>
            <View style={{ alignSelf: 'flex-start', flexDirection: 'row', gap: 7, padding: 10, marginLeft: 20, borderRadius: 10, backgroundColor: colors.brand }}><Icon name="play-outline" size={15} color="#FFFFFF" /><Text style={[typography.caption, { color: '#FFFFFF' }]}>Run trigger</Text></View>
            {definition.steps.map((step, index) => <View key={step.id}>
              <View style={{ height: 18, marginLeft: 40, borderLeftWidth: 1, borderStyle: 'dashed', borderColor: colors.brandLight }} />
              <View style={[surface, { padding: 16, gap: 10, opacity: step.enabled ? 1 : 0.65 }]}>
                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}><View style={{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceElevated }}><Icon name={AGENT_STEP_META[step.kind].icon as IconName} size={21} color={colors.brandLight} /></View><View style={{ flex: 1 }}><Text style={[typography.subhead, { color: colors.text, fontWeight: '700' }]}>{step.title}</Text><Text style={[typography.footnote, { color: colors.textSecondary, marginTop: 4 }]}>{AGENT_STEP_META[step.kind].detail}</Text></View></View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Pressable accessibilityRole="checkbox" accessibilityLabel={`Enable ${step.title}`} accessibilityState={{ checked: step.enabled, disabled: busy }} aria-checked={step.enabled} disabled={busy} onPress={() => changeDefinition(toggleAgentStep(definition, step.id))} style={{ minHeight: 44, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}><Icon name={step.enabled ? 'checkbox' : 'square-outline'} size={21} color={colors.brandLight} /><Text style={[typography.caption, { color: colors.textSecondary }]}>{step.enabled ? 'Enabled' : 'Disabled'}</Text></Pressable>
                  <View style={{ flex: 1 }} />
                  {([-1,1] as const).map(direction => <Pressable key={direction} accessibilityRole="button" accessibilityLabel={`Move ${step.title} ${direction === -1 ? 'up' : 'down'}`} disabled={busy || !moveAgentStep(definition, index, direction)} onPress={() => changeDefinition(moveAgentStep(definition, index, direction))} style={{ width: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center', opacity: busy || !moveAgentStep(definition, index, direction) ? 0.35 : 1 }}><Icon name={direction === -1 ? 'arrow-up-outline' : 'arrow-down-outline'} size={19} color={colors.brandLight} /></Pressable>)}
                </View>
              </View>
            </View>)}
            {confirmRequired(definition) && <Pressable accessibilityRole="checkbox" accessibilityLabel="Authorize coding workflow changes and draft PR" accessibilityState={{ checked: confirmCodeChanges, disabled: busy }} aria-checked={confirmCodeChanges} disabled={busy} onPress={() => setConfirmCodeChanges(value => !value)} style={[surface, { minHeight: 64, flexDirection: 'row', gap: 12, alignItems: 'flex-start' }]}><Icon name={confirmCodeChanges ? 'checkbox' : 'square-outline'} size={24} color={colors.brandLight} /><Text style={[typography.footnote, { flex: 1, color: colors.textSecondary }]}>I authorize this run to prepare changes, execute the configured isolated tests, and create a branch, commit and draft PR in this repository if tests pass and write permissions permit it. This does not authorize merging or releasing.</Text></Pressable>}
            {!capability?.available && <Text style={[typography.footnote, { color: colors.textSecondary }]}>{capability?.reason ?? 'Execution stays disabled until the API confirms the required runtime and repository capabilities.'}</Text>}
            <Button title={definition.mode === 'code_fix' ? 'Run coding workflow' : 'Run review workflow'} loading={workspace.busy === 'start'} disabled={!canRun || !DefinitionSchema.safeParse(definition).success} onPress={() => workspace.start(definition, confirmCodeChanges)} />
            <Text style={[typography.caption, { color: colors.textSecondary }]}>A saved graph is a plan, not an execution receipt. Runs are processed by the configured backend; existing GitHub checks and tests executed by the coding runner are reported separately.</Text>
          </View> : <EmptyState icon="git-network-outline" title="Your next workflow starts here" message="Describe a task and generate a workflow, or choose a template to inspect and edit its steps." />}
        </View>
      </View>
    </ScrollView>
  </KeyboardAvoidingView>;
}
function confirmRequired(definition: WorkflowDefinition) { return definition.mode === 'code_fix'; }
function targetUrl(definition: WorkflowDefinition) {
  const t = definition.target; const root = `https://github.com/${t.owner}/${t.repo}`;
  return (t.kind ?? 'pull_request') === 'repository' ? root : `${root}/${t.kind === 'issue' ? 'issues' : 'pull'}/${t.number}`;
}
function CapabilityLine({ title, available, reason }: { title: string; available: boolean; reason?: string }) {
  const { colors, typography } = useTheme();
  return <View style={{ gap: 4 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Icon name={available ? 'checkmark-circle-outline' : 'ellipse-outline'} size={17} color={available ? colors.brandLight : colors.textSecondary} /><Text style={[typography.subhead, { color: colors.text }]}>{title}: {available ? 'Ready' : 'Needs setup'}</Text></View>{!!reason && <Text style={[typography.caption, { color: colors.textSecondary }]}>{reason}</Text>}</View>;
}
