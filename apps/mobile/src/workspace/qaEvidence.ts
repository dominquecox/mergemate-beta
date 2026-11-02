import { QaReport, type QaReport as Report } from '@mergemate/contracts';
import type { PrCheck } from '../types';

export const QA_REPORT_MAX_BYTES = 64 * 1024;
export function inspectQaReport(text: string, expected: { repository: string; number: number; headSha?: string }, now = Date.now()): { report?: Report; error?: string } {
  if (text.length > QA_REPORT_MAX_BYTES || Array.from(text).reduce((bytes, char) => { const cp = char.codePointAt(0) ?? 0; return bytes + (cp < 128 ? 1 : cp < 2048 ? 2 : cp < 65536 ? 3 : 4); }, 0) > QA_REPORT_MAX_BYTES) return { error: 'Report exceeds the 64 KB limit.' };
  let value: unknown;
  try { value = JSON.parse(text); } catch { return { error: 'Paste a complete JSON report from the MergeMate QA runner.' }; }
  const parsed = QaReport.safeParse(value);
  if (!parsed.success) return { error: 'Invalid QA report. Required scope, suites, results or artifact hashes are missing or inconsistent.' };
  const r = parsed.data;
  if (!expected.headSha || r.repository.toLowerCase() !== expected.repository.toLowerCase() || r.pullRequest !== expected.number || r.headSha !== expected.headSha) return { error: 'This report belongs to a different repository, PR or commit. Run QA for the current head.' };
  if (Date.parse(r.completedAt) > now + 5 * 60 * 1000 || Date.parse(r.startedAt) > now + 5 * 60 * 1000) return { error: 'Report timestamps are in the future.' };
  if (now - Date.parse(r.completedAt) > 48 * 60 * 60 * 1000) return { error: 'Report is older than 48 hours. Re-run QA before relying on it.' };
  return { report: r };
}

export function checkEvidence(check: PrCheck, headSha?: string) {
  if (check.source === 'status') return { label: 'Legacy status report', current: false };
  if (check.source !== 'check_run') return { label: 'Execution source not reported', current: false };
  if (!headSha || !check.headSha) return { label: 'Execution commit not reported', current: false };
  if (check.headSha !== headSha) return { label: 'Different commit: re-run required', current: false };
  return { label: 'GitHub-reported run for this commit', current: true };
}
export function checkDuration(check: PrCheck): string | null {
  const start = Date.parse(check.startedAt ?? ''), end = Date.parse(check.completedAt ?? '');
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return `${Math.round((end - start) / 1000)}s`;
}
