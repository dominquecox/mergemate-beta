import React, { useEffect, useState } from 'react';
import { View, Modal, ScrollView, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import type { QaReport } from '@mergemate/contracts';
import type { PrCheck } from '../types';
import { useTheme } from '../context/ThemeContext';
import { Text } from './Text';
import { Button } from './Button';
import { Icon } from './Icon';
import { checkDuration, checkEvidence, inspectQaReport, QA_REPORT_MAX_BYTES } from '../workspace/qaEvidence';

export function QaEvidenceCard({ repository, number, headSha, checks, sample, cursor, busy, error, capped, onLoadMore, onOpen }: {
  repository: string; number: number; headSha?: string; checks: PrCheck[]; sample: boolean;
  cursor: string | null; busy: boolean; error: string | null; capped: boolean; onLoadMore: () => void; onOpen: (url: string) => void;
}) {
  const { colors, typography, radius } = useTheme();
  const [open, setOpen] = useState(false), [text, setText] = useState(''), [report, setReport] = useState<QaReport | undefined>(), [notice, setNotice] = useState('');
  useEffect(() => { setReport(undefined); setText(''); setNotice(''); setOpen(false); }, [repository, number, headSha, sample]);
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, []);
  const inspected = report ? inspectQaReport(JSON.stringify(report), { repository, number, headSha }, now) : undefined;
  const visibleReport = inspected?.report;
  const current = checks.filter(c => checkEvidence(c, headSha).current);
  const passed = current.filter(c => c.conclusion === 'success' && c.status === 'completed').length;
  const apply = () => {
    if (sample) { setNotice('Sample mode cannot establish execution evidence.'); return; }
    const result = inspectQaReport(text, { repository, number, headSha });
    if (!result.report) { setNotice(result.error ?? 'Report unavailable.'); return; }
    setReport(result.report); setText(''); setNotice(''); setOpen(false);
  };
  const summary = sample ? 'Sample checks: no live execution is certified.' : !checks.length ? cursor ? 'Loading GitHub check evidence...' : 'No automated checks reported. No QA pass claimed.' : `${passed}/${current.length} current-commit runs passed. ${checks.length - current.length} results lack matching execution provenance.`;
  return <View testID="qa-evidence-card" style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: 14, marginTop: 12, gap: 8 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Icon name="flask-outline" size={20} color={colors.brandLight}/><Text accessibilityRole="header" style={[typography.headline, { color: colors.text, flex: 1 }]}>QA evidence</Text></View>
    <Text selectable style={[typography.caption, { color: colors.textSecondary }]}>Head {headSha?.slice(0, 12) ?? 'not available'}{cursor ? ' · partial results' : ''}</Text>
    <Text style={[typography.subhead, { color: colors.text }]}>{summary}</Text>
    <Text style={[typography.caption, { color: colors.textMuted }]}>GitHub reports are not independent verification. A passing build does not establish browser or device coverage.</Text>
    {checks.map(check => <View key={check.id} style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, gap: 4 }}>
      <Text style={[typography.subhead, { color: colors.text, fontWeight: '600' }]}>{check.name}</Text>
      <Text style={[typography.caption, { color: colors.textSecondary }]}>{check.status === 'completed' ? check.conclusion : check.status} · {sample ? 'Sample result' : checkEvidence(check, headSha).label}{check.provider ? ` · ${check.provider}` : ''}{checkDuration(check) ? ` · ${checkDuration(check)}` : ''}</Text>
      {!!check.url && <Button title="View run in GitHub" accessibilityLabel={`View ${check.name} run in GitHub`} variant="ghost" onPress={() => onOpen(check.url!)} style={{ minHeight: 44, alignSelf: 'flex-start' }}/>}
    </View>)}
    {!!cursor && <Button title={checks.length ? 'Load more checks' : 'Load checks'} loading={busy} variant="ghost" onPress={onLoadMore}/>}
    {!!error && <Text accessibilityRole="alert" style={{ color: colors.riskHigh }}>{error}</Text>}
    {capped && <Text style={{ color: colors.textSecondary }}>Pagination limit reached. Open GitHub for the remaining results.</Text>}
    {!sample && <Button title={report ? 'Replace local QA report' : 'Inspect local QA report'} variant="secondary" onPress={() => { setNotice(''); setOpen(true); }}/>}
    {!!report && !visibleReport && <Text accessibilityRole="alert" style={{ color: colors.riskHigh }}>{inspected?.error}</Text>}
    {visibleReport && <View testID="local-qa-report" style={{ gap: 6, borderTopColor: colors.border, borderTopWidth: 1, paddingTop: 10 }}>
      <Text style={[typography.subhead, { color: colors.text, fontWeight: '600' }]}>Local report: {visibleReport.status}</Text>
      <Text style={[typography.caption, { color: colors.textSecondary }]}>User-supplied, not independently verified. Browser with fixture API/speech only; no real OAuth, live AI or physical-device certification.</Text>
      <Text selectable style={{ color: colors.textSecondary }}>Run {visibleReport.runId}{'\n'}Completed {visibleReport.completedAt}{'\n'}Commit {visibleReport.headSha}</Text>
      {visibleReport.suites.map(suite => <Text key={suite.id} style={{ color: colors.text }}>{suite.id}: {suite.status} ({Math.round(suite.durationMs / 1000)}s)</Text>)}
      <Text style={{ color: colors.textSecondary }}>{visibleReport.artifacts.length} artifact hashes recorded. View screenshots in the operator's run folder; artifacts are not uploaded by this report.</Text>
      {visibleReport.artifacts.slice(0, 4).map(artifact => <Text selectable key={artifact.name} style={[typography.caption, { color: colors.textMuted }]}>{artifact.name}{'\n'}SHA256 {artifact.sha256}</Text>)}
      <Button title="Clear local report" variant="ghost" onPress={() => setReport(undefined)}/>
    </View>}
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => { setOpen(false); setText(''); }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: '#0009', justifyContent: 'center', padding: 16 }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 12, backgroundColor: colors.surface, borderRadius: radius.lg }}>
          <Text accessibilityRole="header" style={[typography.headline, { color: colors.text }]}>Inspect a QA report</Text>
          <Text style={{ color: colors.textSecondary }}>Paste report.json from the trusted local runner for this exact PR/head. Data stays in this screen's memory, is never sent to AI, and does not override the executive verdict. Limit 64 KB.</Text>
          <TextInput accessibilityLabel="QA report JSON" value={text} onChangeText={setText} multiline maxLength={QA_REPORT_MAX_BYTES + 1} autoCapitalize="none" autoCorrect={false} textAlignVertical="top" style={{ color: colors.text, borderColor: colors.border, borderWidth: 1, minHeight: 160, maxHeight: 240, padding: 12 }}/>
          {!!notice && <Text accessibilityRole="alert" style={{ color: colors.riskHigh }}>{notice}</Text>}
          <Button title="Inspect report" onPress={apply}/>
          <Button title="Cancel" variant="ghost" onPress={() => { setOpen(false); setText(''); }}/>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  </View>;
}
