import React, { useEffect, useRef, useState } from 'react';
import { View, ScrollView, Pressable, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { useTheme } from '../src/context/ThemeContext';
import { useLayout } from '../src/layout/useLayout';
import { Text } from '../src/components/Text';
import { Header } from '../src/components/Header';
import { Icon, type IconName } from '../src/components/Icon';
import { Button } from '../src/components/Button';
import { EmptyState } from '../src/components/EmptyState';
import { ErrorState } from '../src/components/ErrorState';
import { LoadingState } from '../src/components/LoadingState';
import { StorageService } from '../src/storage';
import { PLAYBOOK_TEMPLATES, REVIEW_STEPS, parsePlaybook, parseReviewPr, type ReviewPlaybook, type ReviewStepId } from '../src/workflows/model';

export default function ReviewPlaybooksScreen() {
  const { user } = useAuth();
  return user ? <PlaybooksWorkspace key={user.id} account={user.id} /> : <LoadingState title="Checking your session..." message="Your playbook belongs to your account." />;
}
function PlaybooksWorkspace({ account }: { account: string }) {
  const { colors, typography } = useTheme();
  const { isDesktop } = useLayout();
  const router = useRouter();
  const [draft, setDraft] = useState<ReviewPlaybook>(() => ({ title: PLAYBOOK_TEMPLATES[0]!.title, steps: [...PLAYBOOK_TEMPLATES[0]!.steps] }));
  const [saved, setSaved] = useState<ReviewPlaybook | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [prUrl, setPrUrl] = useState('');
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState<ReviewStepId[]>([]);
  const alive = useRef(true);
  const saveLock = useRef(false);
  useEffect(() => {
    alive.current = true; setLoading(true); setLoadError('');
    StorageService.getReviewPlaybook(account).then(value => {
      if (!alive.current) return;
      const parsed = parsePlaybook(value);
      if (value && !parsed) setLoadError('Your saved playbook is invalid. Choose a template and save to replace it.');
      if (parsed) { setSaved(parsed); setDraft(parsed); }
    }).catch(() => { if (alive.current) setLoadError('Could not load your local playbook. You can still preview templates; saving will retry local storage.'); })
      .finally(() => { if (alive.current) setLoading(false); });
    return () => { alive.current = false; };
  }, [account, reload]);
  const resetRun = () => { setRunning(false); setCompleted([]); };
  const choose = (playbook: ReviewPlaybook) => {
    if (saveLock.current) return;
    setDraft({ title: playbook.title, steps: [...playbook.steps] }); setEditing(false); resetRun(); setError(''); setMessage('');
  };
  const change = (next: ReviewPlaybook) => { setDraft(next); resetRun(); setMessage(''); };
  const save = async () => {
    const parsed = parsePlaybook(draft);
    if (!parsed) { setError('Use a name up to 48 characters and choose at least two review steps.'); return; }
    if (saveLock.current) return;
    saveLock.current = true; setSaving(true); setError(''); setMessage('');
    try {
      await StorageService.setReviewPlaybook(account, parsed);
      if (alive.current) { setSaved(parsed); setDraft(parsed); setEditing(false); setMessage('Playbook saved on this device.'); }
    } catch { if (alive.current) setError('Could not save locally. Your draft is still here; try again.'); }
    finally { saveLock.current = false; if (alive.current) setSaving(false); }
  };
  const pr = parseReviewPr(prUrl);
  const inputStyle = { minHeight: 48, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.borderLight, color: colors.text, backgroundColor: colors.surfaceElevated, fontFamily: typography.body.fontFamily };
  const surface = { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 22, padding: 20 };
  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.background }}>
    <Header title="Review playbooks" showBack rightAction={<Button title={editing ? 'Preview' : 'Edit flow'} variant="ghost" disabled={loading || saving} onPress={() => { setEditing(!editing); resetRun(); }} />} />
    <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={{ padding: isDesktop ? 28 : 16, paddingBottom: 48, gap: 24 }}>
      <View style={{ gap: 8 }}>
        <Text style={[typography.code, { color: colors.brandLight, fontSize: 11, letterSpacing: 1.2 }]}>A LITTLE STRUCTURE. A BETTER REVIEW.</Text>
        <Text accessibilityRole="header" style={[typography.largeTitle, { color: colors.text }]}>Build a clearer path.</Text>
        <Text style={[typography.body, { color: colors.textSecondary, maxWidth: 580 }]}>Turn your review routine into a reusable checklist. You stay in control of every decision.</Text>
      </View>
      <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 24, alignItems: 'flex-start' }}>
        <View style={{ width: isDesktop ? 300 : '100%', gap: 12 }}>
          <Text accessibilityRole="header" style={[typography.headline, { color: colors.text }]}>Start with a template</Text>
          {PLAYBOOK_TEMPLATES.map(template => <Pressable key={template.id} accessibilityRole="button" accessibilityLabel={`Use ${template.title} template`} disabled={loading || saving} onPress={() => choose(template)} style={({ pressed }) => [surface, { padding: 16, opacity: pressed ? 0.8 : 1, borderColor: draft.title === template.title ? colors.brandLight : colors.border }]}>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: colors.brandSubtle, justifyContent: 'center', alignItems: 'center' }}><Icon name={template.icon as IconName} size={21} color={colors.brandLight} /></View>
              <View style={{ flex: 1 }}><Text style={[typography.subhead, { color: colors.text, fontWeight: '700' }]}>{template.title}</Text><Text style={[typography.caption, { color: colors.textSecondary, marginTop: 3 }]}>{template.steps.length} review steps</Text></View>
              <Icon name="chevron-forward" size={16} color={colors.textSecondary} />
            </View>
            <Text style={[typography.footnote, { color: colors.textSecondary, marginTop: 12 }]}>{template.description}</Text>
          </Pressable>)}
          {saved && <Button title={`Your saved flow: ${saved.title}`} accessibilityLabel="Open saved playbook" variant="secondary" disabled={saving} onPress={() => choose(saved)} />}
          <View style={{ padding: 16, gap: 6 }}><Icon name="lock-closed-outline" size={17} color={colors.textSecondary} /><Text style={[typography.caption, { color: colors.textSecondary }]}>One saved playbook per account on this device. Removed on sign-out. No PR contents or completion history are saved.</Text></View>
        </View>
        <View style={{ flex: 1, width: '100%', minWidth: 0, gap: 16 }}>
          <View style={[surface, { backgroundColor: colors.brandSubtle, borderColor: colors.brandMuted, gap: 14 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Icon name="git-network-outline" size={20} color={colors.brandLight} /><Text style={[typography.caption, { color: colors.brandLight }]}>HUMAN-LED REVIEW FLOW</Text></View>
            {editing ? <TextInput accessibilityLabel="Playbook name" editable={!saving} value={draft.title} maxLength={48} onChangeText={title => change({ ...draft, title })} style={inputStyle} /> : <Text accessibilityRole="header" style={[typography.title2, { color: colors.text }]}>{draft.title}</Text>}
            <Text style={[typography.footnote, { color: colors.textSecondary }]}>{running ? `${completed.length} of ${draft.steps.length} steps checked by you` : 'Context → evidence → a considered decision'}</Text>
          </View>
          {!!loadError && <ErrorState title="Local playbook unavailable" message={loadError} onRetry={() => setReload(value => value + 1)} />}
          {loading ? <LoadingState title="Loading playbook..." message="Reading your local preference." /> : editing ? <View style={[surface, { gap: 8 }]}>
            <Text style={[typography.subhead, { color: colors.textSecondary }]}>Choose two or more steps. New selections are added at the end.</Text>
            {REVIEW_STEPS.map(step => <Pressable key={step.id} disabled={saving} accessibilityRole="checkbox" accessibilityLabel={`Include ${step.title}`} accessibilityState={{ checked: draft.steps.includes(step.id) }} onPress={() => change({ ...draft, steps: draft.steps.includes(step.id) ? draft.steps.filter(id => id !== step.id) : [...draft.steps, step.id] })} style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Icon name={draft.steps.includes(step.id) ? 'checkbox' : 'square-outline'} size={22} color={colors.brandLight} /><Text style={[typography.body, { color: colors.text, flex: 1 }]}>{step.title}</Text>
            </Pressable>)}
          </View> : draft.steps.length === 0 ? <EmptyState title="Your flow needs a review step" message="Choose at least two steps before saving your playbook." actionTitle="Choose review steps" onAction={() => setEditing(true)} /> : <View>
            <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.brand, borderRadius: 9, padding: 10, marginLeft: 20 }}><Icon name="play-outline" size={14} color="#FFFFFF" /><Text style={[typography.caption, { color: '#FFFFFF' }]}>Start with a pull request</Text></View>
            {draft.steps.map((id, index) => {
              const step = REVIEW_STEPS.find(value => value.id === id)!;
              const checked = completed.includes(id);
              return <View key={id}>
                <View style={{ height: 22, borderLeftWidth: 1, borderStyle: 'dashed', borderColor: colors.brandLight, marginLeft: 40 }} />
                <Pressable accessibilityRole="checkbox" accessibilityLabel={`${step.title}, step ${index + 1}`} accessibilityState={{ checked, disabled: !running }} disabled={!running} onPress={() => setCompleted(old => old.includes(id) ? old.filter(value => value !== id) : [...old, id])} style={({ pressed }) => [surface, { padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, borderColor: checked ? colors.brandLight : colors.border, opacity: pressed ? 0.8 : 1 }]}>
                  <View style={{ width: 44, height: 44, backgroundColor: checked ? colors.brandSubtle : colors.surfaceElevated, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}><Icon name={checked ? 'checkmark-outline' : step.icon} size={21} color={checked ? colors.brandLight : colors.textSecondary} /></View>
                  <View style={{ flex: 1 }}><Text style={[typography.subhead, { color: colors.text, fontWeight: '600' }]}>{step.title}</Text><Text style={[typography.footnote, { color: colors.textSecondary, marginTop: 4 }]}>{step.detail}</Text></View>
                  <Text style={[typography.code, { color: colors.textSecondary, fontSize: 11 }]}>{String(index + 1).padStart(2, '0')}</Text>
                </Pressable>
              </View>;
            })}
          </View>}
          {!!error && <Text accessibilityRole="alert" style={[typography.footnote, { color: colors.riskHigh }]}>{error}</Text>}
          {!!message && <Text accessibilityLiveRegion="polite" style={[typography.footnote, { color: colors.brandLight }]}>{message}</Text>}
          <Button title="Save playbook" loading={saving} disabled={loading || !parsePlaybook(draft)} variant="secondary" onPress={save} />
          {!editing && <View style={[surface, { gap: 12 }]}>
            <Text accessibilityRole="header" style={[typography.headline, { color: colors.text }]}>Put your flow to work</Text>
            <Text style={[typography.footnote, { color: colors.textSecondary }]}>Paste a GitHub PR link. The workspace uses your existing repository access.</Text>
            <TextInput accessibilityLabel="GitHub pull request URL" value={prUrl} onChangeText={value => { setPrUrl(value); resetRun(); }} placeholder="https://github.com/owner/repo/pull/123" placeholderTextColor={colors.textMuted} maxLength={300} autoCapitalize="none" autoCorrect={false} keyboardType="url" style={inputStyle} />
            {!!prUrl && !pr && <Text style={[typography.caption, { color: colors.riskHigh }]}>Use a direct https://github.com/owner/repo/pull/number link.</Text>}
            {!running ? <Button title="Start guided review" disabled={!pr || loading} onPress={() => { setRunning(true); setCompleted([]); setMessage('Review started. Open the PR, then return here to track your steps.'); }} /> : <View style={{ gap: 8 }}>
              <Button title="Open PR workspace" onPress={() => { if (pr) router.push({ pathname: '/pr/[owner]/[repo]/[number]', params: pr }); }} />
              <Button title="Reset review progress" variant="ghost" onPress={resetRun} />
            </View>}
            <Text style={[typography.caption, { color: colors.textSecondary }]}>Checked steps record your progress only. They do not validate CI, certify safety, run AI or approve/merge a PR. Progress resets when the PR or flow changes.</Text>
          </View>}
        </View>
      </View>
    </ScrollView>
  </KeyboardAvoidingView>;
}
