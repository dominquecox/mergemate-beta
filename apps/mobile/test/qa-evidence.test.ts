import { describe, it, expect } from 'vitest';
import { inspectQaReport, checkEvidence, checkDuration, desktopQaCommand } from '../src/workspace/qaEvidence';
import { getExecutiveVerdict } from '../src/workspace/executiveVerdict';
import { mapCheck } from '../src/api/mappers';
const sha = 'a'.repeat(40), now = Date.parse('2026-11-02T20:00:00Z');
const context = { repository: 'acme/app', number: 7, headSha: sha };
const receipt = () => ({ version: 1, runId: 'fa4f05e6-1456-4ffd-a5d0-7e162cd0d908', repository: 'acme/app', pullRequest: 7, headSha: sha, scope: 'browser-fixtures', runner: 'MergeMate local runner', startedAt: '2026-11-02T19:00:00Z', completedAt: '2026-11-02T19:05:00Z', status: 'passed', cleanCheckout: true, suites: ['export-web', 'mobile-polish', 'session-lifecycle'].map(id => ({ id, status: 'passed', exitCode: 0, durationMs: 1000 })), artifacts: [{ name: 'mobile-polish/393.png', sha256: 'b'.repeat(64), bytes: 100 }] });
const inspect = (value: unknown) => inspectQaReport(JSON.stringify(value), context, now);
describe('commit-bound QA evidence', () => {
  it('creates a shell-safe desktop command only for the trusted repo and exact revision', () => {
    expect(desktopQaCommand('dominquecox/mergemate', 204, sha)).toBe(`npm run qa:run -- --pr 204 --head ${sha}`);
    for (const args of [['other/repo', 7, sha], ['dominquecox/mergemate', 0, sha], ['dominquecox/mergemate', 1.1, sha], ['dominquecox/mergemate', 7, `${sha};whoami`]] as const) expect(desktopQaCommand(args[0], args[1], args[2])).toBeNull();
  });
  it('accepts a consistent exact-revision fixture receipt without calling it independent verification', () => { expect(inspect(receipt()).report?.scope).toBe('browser-fixtures'); });
  it('rejects different repository, PR, head and a workspace with unknown head', () => {
    for (const changed of [{ repository: 'other/app' }, { pullRequest: 8 }, { headSha: 'c'.repeat(40) }]) expect(inspect({ ...receipt(), ...changed }).error).toMatch(/different/);
    expect(inspectQaReport(JSON.stringify(receipt()), { ...context, headSha: undefined }, now).report).toBeUndefined();
  });
  it('rejects stale and future receipts and reversed intervals', () => {
    expect(inspectQaReport(JSON.stringify(receipt()), context, now + 49 * 3600000).error).toMatch(/older/);
    expect(inspectQaReport(JSON.stringify(receipt()), context, now - 2 * 3600000).error).toMatch(/future/);
    expect(inspect({ ...receipt(), completedAt: '2026-11-02T18:00:00Z' }).report).toBeUndefined();
  });
  it('rejects false passing status, skipped suites, duplicate suites and missing screenshots', () => {
    for (const mutation of [ { artifacts: [] }, { suites: receipt().suites.map(s => ({ ...s, status: 'not_run', exitCode: null })) }, { suites: [receipt().suites[0], receipt().suites[0], receipt().suites[2]] }, { suites: receipt().suites.map(s => ({ ...s, exitCode: 7 })) } ]) expect(inspect({ ...receipt(), ...mutation }).report).toBeUndefined();
  });
  it('preserves actual failure and invalidation instead of converting them to a pass', () => {
    const failure = { ...receipt(), status: 'failed', suites: receipt().suites.map((s, i) => i === 1 ? { ...s, status: 'failed', exitCode: 1 } : s) };
    expect(inspect(failure).report?.status).toBe('failed');
    expect(inspect({...failure,suites:failure.suites.map(s => s.status==='failed'?{...s,exitCode:null}:s)}).report?.status).toBe('failed');
    expect(inspect({ ...receipt(), status: 'invalidated' }).report?.status).toBe('invalidated');
  });
  it('rejects dirty claims, unknown fields, oversized inputs, traversal and duplicate artifacts', () => {
    for (const changed of [{ cleanCheckout: false }, { token: 'not-allowed' }, { artifacts: [{ ...receipt().artifacts[0], name: '../secrets.png' }] }, { artifacts: [...receipt().artifacts, ...receipt().artifacts] }]) expect(inspect({ ...receipt(), ...changed }).report).toBeUndefined();
    expect(inspectQaReport('x'.repeat(65537), context, now).error).toMatch(/64 KB/);
    expect(inspectQaReport('{', context, now).report).toBeUndefined();
  });
  it('never labels unknown, stale or legacy status as a current execution run', () => {
    const check = { id: 'run:1', name: 'browser', status: 'completed' as const, conclusion: 'success' as const, source: 'check_run' as const, headSha: sha };
    expect(checkEvidence(check, sha).current).toBe(true);
    expect(checkEvidence(check, 'b'.repeat(40)).current).toBe(false);
    expect(checkEvidence({ ...check, headSha: undefined }, sha).current).toBe(false);
    expect(checkEvidence({ ...check, source: 'status' }, sha).current).toBe(false);
    expect(checkEvidence({ ...check, source: undefined }, sha).current).toBe(false);
  });
  it('cannot produce a safe verdict from passing checks reported against another revision', () => {
    const risk = { level: 'low' as const, reasons: ['Small change'], coverage: { totalFiles: 1, analyzedFiles: 1, skippedFiles: 0, truncatedFiles: 0 } };
    const check = { id: 'run:1', name: 'browser', status: 'completed' as const, conclusion: 'success' as const, source: 'check_run' as const, headSha: 'b'.repeat(40) };
    expect(getExecutiveVerdict({ headSha: sha, risk, checks: [check] }).level).toBe('caution');
    expect(getExecutiveVerdict({ headSha: sha, risk, checks: [{ ...check, headSha: sha }] }).level).toBe('safe');
  });
  it('preserves provider/head/timing through HTTP mapping and omits impossible elapsed time', () => {
    const check = mapCheck({ id: 'run:1', name: 'browser', state: 'success', source: 'check_run', headSha: sha, provider: 'QA', startedAt: '2026-11-02T19:00:00Z', completedAt: '2026-11-02T19:00:12Z' }, 0);
    expect(check).toMatchObject({ source: 'check_run', provider: 'QA', headSha: sha });
    expect(checkDuration(check)).toBe('12s');expect(checkDuration({ ...check, completedAt: '2026-11-02T18:00:00Z' })).toBeNull();
  });
});
