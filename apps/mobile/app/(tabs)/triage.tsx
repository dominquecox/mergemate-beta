import { ExperienceIntro } from '../../src/components/ExperienceDesign';
import { Button } from '../../src/components/Button';
import { InfoTip } from '../../src/components/InfoTip';
import { AccessGuidanceBanner } from '../../src/components/AccessGuidanceBanner';
import { AudioCommuteBar } from '../../src/components/AudioCommuteBar';
import { ExecutiveBriefExport } from '../../src/components/ExecutiveBriefExport';
import { triageExecutiveNarration } from '../../src/readout/narration';
import type { ExecutiveBriefEntry } from '../../src/workspace/executiveExport';
import { SwipeTriageCard } from '../../src/components/SwipeTriageCard';
import { useRouter } from 'expo-router';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { Text } from '../../src/components/Text';
import { useTheme } from '../../src/context/ThemeContext';
import { api } from '../../src/api';
import { toUserMessage } from '../../src/api/errors';
import { TriageItem, TriageLane, PrDetail, Notification } from '../../src/types';
import { Header } from '../../src/components/Header';
import { Section } from '../../src/components/ScreenDesign';
import { EmptyState } from '../../src/components/EmptyState';
import { ErrorState } from '../../src/components/ErrorState';
import { LoadingState } from '../../src/components/LoadingState';
import { Avatar } from '../../src/components/Avatar';
import { RiskBadge } from '../../src/components/RiskBadge';
import { relativeTime } from '../../src/format/activity';
import { Icon } from '../../src/components/Icon';
import { TriageDigestBar } from '../../src/components/TriageDigestBar';
import { triggerAndroidHaptic } from '../../src/platform/android';
import { detectAgentProvenance } from '../../src/workspace/provenance';
import { getExecutiveVerdict } from '../../src/workspace/executiveVerdict';
import { useLayout } from '../../src/layout/useLayout';

export default function TriageScreen() {
  const router = useRouter();
  const { isDesktop } = useLayout();
  const lock = useRef(false), gesture = useRef(false);
  const [gesturing, setGesturing] = useState(false);
  const [saving, setSaving] = useState(false);
  const { colors, typography, radius } = useTheme();

  const [reviewed, setReviewed] = useState<ExecutiveBriefEntry[]>([]), [completedAt, setCompletedAt] = useState<number | null>(null), startedAt = useRef(Date.now());
  const [inbox, setInbox] = useState<Notification[]>([]);
  const [metadata, setMetadata] = useState<{ ref: string; detail?: PrDetail; failed?: boolean } | null>(null);
  const [queue, setQueue] = useState<TriageItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<TriageItem[]>([]);

  const loadQueue = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [items, notifications] = await Promise.all([api.getTriageQueue(), api.getNotifications('all').catch(() => [])]);
      setInbox(notifications);
      setQueue(items);
      setUndoStack([]); setReviewed([]); setCompletedAt(null); startedAt.current = Date.now();
    } catch (e) {
      setError(toUserMessage(e, "We couldn't load your triage deck right now. Please try again."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  const currentItem = queue[0];
  const detail = metadata?.ref === currentItem?.prRef ? metadata?.detail : undefined;
  const notification = inbox.find(item => `${item.repo}#${item.number}` === currentItem?.prRef);
  const author = detail?.author ?? currentItem?.author ?? notification?.author;
  const risk = notification?.risk;
  const checks = detail?.checks ?? [];
  const ciFailed = checks.some(check => check.conclusion === 'failure');
  const ciPassed = checks.length > 0 && checks.every(check => check.conclusion === 'success');
  const ciLabel = !detail ? 'CI unavailable' : checks.length === 0 ? 'No checks' : ciPassed ? 'All CI green' : ciFailed ? 'CI failed' : 'CI pending';
  const total = queue.length + undoStack.length;
  const processedCount = undoStack.length;
  const progressPercent = total > 0 ? (processedCount / total) * 100 : 100;

  const provenance = detectAgentProvenance({
    author,
    headBranch: detail?.headBranch,
    title: currentItem?.title ?? detail?.title,
  });
  const verdict = getExecutiveVerdict({
    headSha: detail?.headSha,
    risk: detail?.risk ?? (risk ? { level: risk, reasons: [currentItem.reason], coverage: { analyzedFiles: 1, skippedFiles: 0, truncatedFiles: 0 } } : undefined),
    files: detail?.files,
    checks: detail?.checks,
    secretWarning: detail?.secretWarning,
    changedFilesCount: detail?.changedFilesCount,
  });

  const handleDecision = async (lane: TriageLane) => {
    if (isLoading || queue.length === 0 || lock.current) return false;
    triggerAndroidHaptic();
    lock.current = true; setSaving(true);
    const current = queue[0];
    try {
      await api.setTriageChoice(current.prRef, lane);
      setError(null);
      setReviewed(prev => [...prev, { prRef: current.prRef, title: current.title ?? detail?.title ?? notification?.title ?? 'Title unavailable', agent: provenance.agentName ?? author ?? 'Author unavailable', level: verdict.level, reason: verdict.summary, lane }]);
      if (queue.length === 1) setCompletedAt(Date.now());
      setUndoStack((prev) => [current, ...prev]);
      setQueue((prev) => prev.slice(1));
      return true;
    } catch (e) {
      setError(toUserMessage(e, "Couldn't save your choice."));
      return false;
    } finally { lock.current = false; setSaving(false); }
  };

  const handleUndo = async () => {
    if (isLoading || !undoStack.length || lock.current) return;
    lock.current = true; setSaving(true);
    const [last, ...rest] = undoStack;
    try {
      await api.undoTriageChoice(last.prRef);
      setError(null);
      setQueue(prev => [last, ...prev]);
      setUndoStack(rest);
      setReviewed(old => old.filter(entry => entry.prRef !== last.prRef));
      setCompletedAt(null);
    } catch (e) {
      setError(toUserMessage(e, "Couldn't undo that choice."));
    } finally { lock.current = false; setSaving(false); }
  };

  const decisionRef = useRef(handleDecision);
  decisionRef.current = handleDecision;
  const undoActionRef = useRef(handleUndo);
  undoActionRef.current = handleUndo;

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (gesture.current) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.key === '1' || e.key === 'ArrowLeft') {
        e.preventDefault();
        void decisionRef.current('ignore');
      } else if (e.key === '2' || e.key === 'ArrowDown') {
        e.preventDefault();
        void decisionRef.current('fyi');
      } else if (e.key === '3' || e.key === 'ArrowRight') {
        e.preventDefault();
        void decisionRef.current('needs_you');
      } else if (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'u') {
        e.preventDefault();
        void undoActionRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!currentItem) return;
    let active = true;
    const [fullRepo, number] = currentItem.prRef.split('#');
    const [owner, repo] = fullRepo.split('/');
    api.getPrMetadata(owner, repo, Number(number)).then(fetched => {
      if (active) setMetadata({ ref: currentItem.prRef, detail: fetched });
    }).catch(() => { if (active) setMetadata({ ref: currentItem.prRef, failed: true }); });
    return () => { active = false; };
  }, [currentItem?.prRef]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Header
        title="Triage Deck"
        rightAction={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Text style={[typography.code, { color: colors.textSecondary, fontSize: 11 }]}>{processedCount} of {total}</Text>{undoStack.length > 0 && <TouchableOpacity disabled={saving || gesturing} onPress={handleUndo} style={styles.undoBtn} accessibilityRole="button" accessibilityLabel="Undo last triage choice"><Icon name="arrow-undo-outline" size={20} color={colors.brandLight} /></TouchableOpacity>}</View>}
        footer={<View style={{ paddingHorizontal: 16, paddingBottom: 8 }}><View style={[styles.progressTrack, { backgroundColor: colors.surfaceElevated }]} accessibilityRole="progressbar" accessibilityLabel="Triage progress" accessibilityValue={{ min: 0, max: total || 1, now: processedCount }}><View style={[styles.progressBar, { backgroundColor: colors.brand, width: `${progressPercent}%` }]} /></View></View>}
      />

      <AudioCommuteBar sentences={triageExecutiveNarration(queue.map(item => { const note = inbox.find(n => `${n.repo}#${n.number}` === item.prRef), agent = detectAgentProvenance({ author: note?.author ?? item.author }); return { prRef: item.prRef, title: item.title ?? note?.title ?? 'Title unavailable', agent: agent.agentName ?? note?.author ?? 'Author unavailable', level: item.prRef === currentItem?.prRef ? verdict.level : note?.risk === 'high' ? 'blocked' : note?.risk === 'low' ? 'safe' : 'caution' }; }))} />
      <ScrollView contentContainerStyle={{ padding: isDesktop ? 24 : 16, paddingBottom: 36, flexGrow: 1 }}>
        <AccessGuidanceBanner error={error} compact />
        {/* Top Bento Command Header */}
        <View style={[styles.topHeaderBento, isDesktop && { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
          <View style={{ flex: 1, minWidth: 260 }}>
            <ExperienceIntro compact eyebrow="Your next decision" title="Keep work moving." description="Focus on one change, follow its evidence, and send deeper work to an agent workflow." />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <InfoTip
              title="Triage Deck"
              body="Swipe cards or use hotkeys (1 Ignore, 2 FYI, 3 Needs you, Z Undo) to sort your queue in seconds. Choices organize MergeMate only and never modify GitHub."
              size={16}
            />
            <Button title="Open agent workflows" variant="secondary" icon={<Icon name="git-network-outline" size={16} color={colors.brandLight} />} onPress={() => router.push('/workflows')} />
          </View>
        </View>

        {isLoading ? <LoadingState title="Loading triage deck..." message="Sorting your pull requests by review priority." /> : error && !currentItem && !reviewed.length ? <ErrorState title="Could not load triage deck" message={error} onRetry={loadQueue} /> : !currentItem ? (
          <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 40, paddingHorizontal: 20 }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.statusGoodBg, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
              <Icon name="checkmark-done" size={28} color={colors.statusGood} />
            </View>
            <Text style={[typography.title2, { color: colors.text, textAlign: 'center', fontWeight: '700' }]}>
              All Caught Up!
            </Text>
            <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', marginTop: 6, maxWidth: 360 }]}>
              {total > 0 ? `You've triaged all ${total} pull requests before stepping into the office.` : 'No pull requests waiting to be triaged.'}
            </Text>
            {!!error && <Text accessibilityRole="alert" style={{ color: colors.statusAlert }}>{error}</Text>}
            <ExecutiveBriefExport entries={reviewed} elapsed={Math.max(0, ((completedAt ?? startedAt.current) - startedAt.current) / 1000)} />
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
              <TouchableOpacity onPress={() => router.push('/(tabs)/inbox')} style={[styles.completionBtn, { backgroundColor: colors.brand, borderRadius: radius.md }]} accessibilityRole="button" accessibilityLabel="Open Inbox">
                <Text style={[typography.subhead, { color: '#FFFFFF', fontWeight: '600' }]}>View Inbox</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={loadQueue} style={[styles.completionBtn, { backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md }]} accessibilityRole="button" accessibilityLabel="Reload Deck">
                <Text style={[typography.subhead, { color: colors.text, fontWeight: '600' }]}>Reload Deck</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={{ marginTop: 12, gap: 14 }}>
            <TriageDigestBar queue={queue} />
            {!!error && <Text accessibilityRole="alert" style={[typography.footnote, { color: colors.statusAlert }]}>{error}</Text>}

            {/* Responsive Desktop 2-Column Bento Workspace vs Mobile Stack */}
            <View style={[styles.bentoWorkspace, isDesktop && styles.bentoWorkspaceDesktop]}>
              {/* Left/Center Primary Decision Bento Cell */}
              <View style={[styles.primaryDeckCol, isDesktop && { flex: 7 }]}>
                <View style={{ height: 8, marginHorizontal: 20, backgroundColor: colors.surfaceElevated, borderRadius: 12 }} />
                <View style={{ height: 8, marginHorizontal: 10, marginTop: -3, backgroundColor: colors.surfaceSecondary, borderRadius: 12 }} />
                <SwipeTriageCard key={currentItem.prRef} disabled={saving} onDecision={handleDecision} onInteraction={busy => { gesture.current = busy; setGesturing(busy); }}>
                  <TouchableOpacity
                    style={styles.cardBtn}
                    disabled={saving}
                    onPress={() => {
                      if (gesture.current) return;
                      const [fullRepo = 'owner/repo', num = '1'] = currentItem.prRef.split('#');
                      const [owner = 'owner', repo = 'repo'] = fullRepo.split('/');
                      router.push(`/pr/${owner}/${repo}/${num}`);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Open pull request ${currentItem.title ?? currentItem.prRef}`}
                  >
                    <Section style={{ padding: 16 }}>
                      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <View style={[styles.repoIconBox, { backgroundColor: colors.brandSubtle }]}>
                            <Icon name="git-pull-request-outline" size={14} color={colors.brandLight} />
                          </View>
                          <Text style={[typography.code, { color: colors.textSecondary, fontSize: 11 }]}>{currentItem.prRef}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          {provenance.isAgentAuthored && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.brandSubtle, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.full }}>
                              <Icon name="hardware-chip-outline" size={11} color={colors.brandLight} />
                              <Text style={[typography.caption, { color: colors.brandLight, fontSize: 11, fontWeight: '600' }]}>{provenance.agentName}</Text>
                            </View>
                          )}
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: verdict.tone === 'green' ? colors.statusGoodBg : verdict.tone === 'yellow' ? colors.statusWarningBg : colors.statusAlertBg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.full }}>
                            <Icon name={verdict.iconName} size={11} color={verdict.tone === 'green' ? colors.statusGood : verdict.tone === 'yellow' ? colors.statusWarning : colors.statusAlert} />
                            <Text style={[typography.caption, { color: verdict.tone === 'green' ? colors.statusGood : verdict.tone === 'yellow' ? colors.statusWarning : colors.statusAlert, fontSize: 11, fontWeight: '700' }]}>{verdict.headline.split('·')[0].trim()}</Text>
                          </View>
                        </View>
                      </View>
                      <Text accessibilityRole="header" style={[typography.title2, { color: colors.text, marginTop: 8 }]}>{currentItem.title ?? detail?.title ?? currentItem.prRef}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
                        <Avatar login={author ?? '?'} size={22} />
                        <Text style={[typography.footnote, { color: colors.textSecondary, flex: 1 }]}>{author ?? 'Author unavailable'}</Text>
                        <Text style={[typography.caption, { color: colors.textSecondary }]}>{detail ? relativeTime(detail.updatedAt) : notification ? relativeTime(notification.updatedAt) : 'Time unavailable'}</Text>
                      </View>
                      <View style={{ backgroundColor: colors.brandSubtle, padding: 12, borderRadius: 12, marginTop: 12, borderWidth: 1, borderColor: colors.brandMuted }}>
                        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                            <Icon name="sparkles" size={14} color={colors.brandLight} />
                            <Text style={[typography.caption, { color: colors.brandLight, fontWeight: '700', letterSpacing: 0.6 }]}>AI TRIAGE INSIGHT</Text>
                          </View>
                          <InfoTip
                            title="AI Triage Insight"
                            body="Highlights why this pull request surfaced in your triage queue (for example, agent co-authorship, sensitive file changes, or review requests)."
                            size={14}
                          />
                        </View>
                        <Text style={[typography.body, { color: colors.text }]}>{currentItem.reason}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                        {detail ? <><Text style={[typography.code, { color: colors.statusGood, fontSize: 11 }]}>+{detail.additions}</Text><Text style={[typography.code, { color: colors.statusAlert, fontSize: 11 }]}>-{detail.deletions}</Text><Text style={[typography.code, { color: colors.textSecondary, fontSize: 11 }]}>{detail.changedFilesCount} files</Text></> : <Text style={[typography.caption, { color: colors.textSecondary }]}>{metadata?.ref === currentItem.prRef && metadata.failed ? 'Diff unavailable' : 'Loading details…'}</Text>}
                        {risk && <RiskBadge level={risk} compact />}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: ciPassed ? colors.statusGoodBg : ciFailed ? colors.statusAlertBg : colors.surfaceElevated, borderRadius: 9999, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 'auto' }}>
                          <Icon name={ciPassed ? 'checkmark-circle-outline' : ciFailed ? 'close-circle-outline' : 'time-outline'} size={13} color={ciPassed ? colors.statusGood : ciFailed ? colors.statusAlert : colors.textSecondary} />
                          <Text style={[typography.caption, { color: ciPassed ? colors.statusGood : ciFailed ? colors.statusAlert : colors.textSecondary }]}>{ciLabel}</Text>
                        </View>
                      </View>
                    </Section>
                  </TouchableOpacity>
                </SwipeTriageCard>

                {/* Compact Integrated 3-Pill Decision Bar */}
                <View style={[styles.decisionPillDock, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  {([
                    { lane: 'ignore', label: 'Ignore', keyHint: '1', icon: 'close', color: colors.textSecondary, bg: colors.surfaceElevated },
                    { lane: 'fyi', label: 'FYI · Later', keyHint: '2', icon: 'time-outline', color: colors.statusWarning, bg: colors.statusWarningBg },
                    { lane: 'needs_you', label: 'Needs you', keyHint: '3', icon: 'flash', color: '#FFFFFF', bg: colors.brand },
                  ] as const).map(action => (
                    <TouchableOpacity
                      key={action.lane}
                      disabled={saving || gesturing}
                      accessibilityState={{ disabled: saving, busy: saving }}
                      onPress={() => handleDecision(action.lane)}
                      accessibilityRole="button"
                      accessibilityLabel={action.label}
                      style={[
                        styles.decisionPillBtn,
                        {
                          backgroundColor: action.bg,
                          borderColor: action.lane === 'needs_you' ? colors.brandLight : colors.border,
                        },
                      ]}
                    >
                      <Icon name={action.icon} size={16} color={action.color} />
                      <Text style={[typography.caption, { color: action.color, fontWeight: '700' }]}>{action.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={[typography.footnote, { color: colors.textSecondary, textAlign: 'center', marginTop: 12 }]}>Your choices organize MergeMate. They never change the pull request on GitHub.</Text>
                <Text style={[typography.caption, { color: colors.textMuted, textAlign: 'center', marginTop: 4 }]}>Desktop hotkeys: 1 Ignore · 2 FYI · 3 Needs you · Z Undo</Text>
              </View>

              {/* Right Bento Column: Verdict Inspector + Upcoming Queue */}
              <View style={[styles.sideBentoCol, isDesktop && { flex: 5 }]}>
                {/* Bento Cell A: Executive Verdict & Fast Workflow Dispatch */}
                <View style={[styles.bentoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <Text style={[typography.caption, { color: colors.brandLight, fontWeight: '700', letterSpacing: 0.6 }]}>EXECUTIVE VERDICT</Text>
                      <InfoTip
                        title="Executive Verdict"
                        body="Summarizes merge readiness based on risk level, CI check results, and sensitive file guardrails."
                        size={14}
                      />
                    </View>
                    <Text style={[typography.code, { color: colors.textMuted, fontSize: 10 }]}>{ciLabel}</Text>
                  </View>
                  <Text style={[typography.headline, { color: colors.text, marginTop: 6 }]}>{verdict.headline}</Text>
                  <Text style={[typography.footnote, { color: colors.textSecondary, marginTop: 4 }]}>{verdict.summary}</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel="Run agent workflow on current pull request"
                      onPress={() => router.push(`/workflows?target=${encodeURIComponent(`https://github.com/${currentItem.prRef.replace('#', '/pull/')}`)}`)}
                      style={[styles.fastActionBtn, { backgroundColor: colors.brandSubtle, borderColor: colors.brandMuted }]}
                    >
                      <Icon name="git-network-outline" size={14} color={colors.brandLight} />
                      <Text style={[typography.caption, { color: colors.brandLight, fontWeight: '700' }]}>Automate PR workflow →</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Bento Cell B: Up Next in Triage Queue */}
                <View style={[styles.bentoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text style={[typography.caption, { color: colors.textSecondary, fontWeight: '700', letterSpacing: 0.6 }]}>UP NEXT IN QUEUE</Text>
                    <Text style={[typography.code, { color: colors.textMuted, fontSize: 11 }]}>{Math.max(0, queue.length - 1)} waiting</Text>
                  </View>
                  {queue.length <= 1 ? (
                    <Text style={[typography.footnote, { color: colors.textSecondary }]}>This is the final pull request in your current triage deck.</Text>
                  ) : (
                    <View style={{ gap: 8 }}>
                      {queue.slice(1, 5).map((item) => (
                        <View
                          key={item.prRef}
                          style={[styles.upNextRow, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
                        >
                          <View style={[styles.repoIconBox, { backgroundColor: colors.brandSubtle }]}>
                            <Icon name="git-branch-outline" size={13} color={colors.brandLight} />
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={[typography.caption, { color: colors.text, fontWeight: '600' }]} numberOfLines={1}>
                              {item.title ?? item.prRef}
                            </Text>
                            <Text style={[typography.code, { color: colors.textSecondary, fontSize: 10, marginTop: 2 }]} numberOfLines={1}>
                              {item.prRef} · {item.reason}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  undoBtn: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  cardBtn: { minHeight: 44, minWidth: 44 },
  completionBtn: { minHeight: 44, minWidth: 44, paddingHorizontal: 20, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  progressTrack: { height: 4, width: '100%', borderRadius: 4, overflow: 'hidden' },
  progressBar: { height: '100%' },
  topHeaderBento: {
    gap: 12,
    marginBottom: 12,
  },
  bentoWorkspace: {
    gap: 14,
  },
  bentoWorkspaceDesktop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  primaryDeckCol: {
    minWidth: 0,
  },
  sideBentoCol: {
    minWidth: 280,
    gap: 12,
  },
  repoIconBox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  decisionPillDock: {
    flexDirection: 'row',
    gap: 8,
    padding: 8,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 14,
  },
  decisionPillBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
  },
  bentoCard: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  fastActionBtn: {
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  upNextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
});
