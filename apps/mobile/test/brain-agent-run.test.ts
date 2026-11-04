import { describe, expect, it } from 'vitest';
import { BrainRunResponseSchema, type BrainRunResponse, type BrainRunStatus, type Card, type Lock } from '@mergemate/contracts';
import { POLL_INTERVAL_MS, POLL_LIMIT_MS, approveRunPath, draftPrUrl, nextWatch, primaryAction, runIdFromBranch, runSummary, safeHttpsUrl } from '../src/brain/agentRun';
import { mockClient } from '../src/api/mock';

const card = { id: 'c1', title: 'T', status: 'open', branch: 'mergemate-agent/r1' } as Card;
const lock = { cardId: 'c1' } as Lock;

describe('agent run helpers', () => {
  it('shows Proceed before the lock and Plan with agent after it', () => {
    expect(primaryAction(card, null)).toBe('proceed');
    expect(primaryAction(card, lock)).toBe('plan');
    expect(primaryAction({ ...card, status: 'merged' }, lock)).toBeNull();
  });

  it('polls every 5 seconds for up to 5 minutes and stops on a PR number', () => {
    expect([POLL_INTERVAL_MS, POLL_LIMIT_MS]).toEqual([5000, 300000]);
    expect(nextWatch(card, 0).state).toBe('planning');
    expect(nextWatch(card, POLL_LIMIT_MS).state).toBe('timeout');
    expect(nextWatch({ ...card, prNumber: 9 }, 10)).toMatchObject({ state: 'pr', prNumber: 9 });
  });

  it('only allows https links and builds the draft PR link', () => {
    expect(safeHttpsUrl('http://x.test/pull/1')).toBeNull();
    expect(safeHttpsUrl('javascript:alert(1)')).toBeNull();
    expect(safeHttpsUrl('https://github.com/a/b/pull/1')).toBe('https://github.com/a/b/pull/1');
    expect(draftPrUrl({ owner: 'a', repo: 'b' }, 7)).toBe('https://github.com/a/b/pull/7');
  });

  it('opens the approve screen for the run', () => {
    expect(approveRunPath('r 1')).toBe('/workflows?run=r%201');
  });
});

describe('mock runBrain', () => {
  it.each<BrainRunStatus>(['running', 'pr_opened', 'no_change', 'failed'])('returns a contract-valid %s response', async (status) => {
    mockClient.setMockRunStatus(status);
    const res = await mockClient.runBrain('proj-1');
    expect(res.status).toBe(status);
    expect(BrainRunResponseSchema.safeParse(res).success).toBe(true);
  });
});

describe('run id from the card branch', () => {
  it('reads the run id only from a mergemate-agent branch', () => {
    expect(runIdFromBranch('mergemate-agent/f58315bf-353b-4688-94ff-cd2ec6c42de3')).toBe('f58315bf-353b-4688-94ff-cd2ec6c42de3');
    expect(runIdFromBranch('feature/x')).toBeNull();
    expect(runIdFromBranch('mergemate-agent/')).toBeNull();
    expect(runIdFromBranch('mergemate-agent/a/b')).toBeNull();
    expect(runIdFromBranch('mergemate-agent/../x')).toBeNull();
    expect(runIdFromBranch(undefined)).toBeNull();
  });
});

describe('agent run summary block', () => {
  const base = { planning: false, prLink: null as string | null, resumableBranch: null as string | null };
  const running = { status: 'running', card, summary: 'Rename the label', files: ['a.ts', 'b.ts'], runId: 'r1', branch: 'mergemate-agent/r1' } as BrainRunResponse;

  it('says Planning while the request is in flight, with no button', () => {
    expect(runSummary({ ...base, planning: true, run: null })).toMatchObject({ heading: 'Planning', primary: null, files: [] });
  });
  it('says Patch ready with the one-line summary, file chips, small branch and one Approve button', () => {
    expect(runSummary({ ...base, run: running })).toEqual({
      heading: 'Patch ready', tone: 'info', summary: 'Rename the label', files: ['a.ts', 'b.ts'], branch: 'mergemate-agent/r1', primary: { kind: 'approve', label: 'Approve the patch' },
    });
  });
  it('says Draft PR #n with an Open PR button once the PR exists', () => {
    expect(runSummary({ ...base, run: running, prNumber: 12, prLink: 'https://github.com/o/r/pull/12' })).toMatchObject({ heading: 'Draft PR #12', tone: 'good', primary: { kind: 'open_pr', label: 'Open PR' } });
    expect(runSummary({ ...base, run: running, prNumber: 12 })?.primary).toBeNull();
  });
  it('says Failed with Retry, and No change needed with no button', () => {
    expect(runSummary({ ...base, run: { ...running, status: 'failed', message: 'Could not start' } as BrainRunResponse })).toMatchObject({ heading: 'Failed', tone: 'bad', summary: 'Could not start', primary: { kind: 'retry' } });
    expect(runSummary({ ...base, run: { ...running, status: 'no_change', summary: 'Nothing to do' } as BrainRunResponse })).toMatchObject({ heading: 'No change needed', primary: null });
  });
  it('lets a reloaded card with an agent branch reopen its run, and shows nothing otherwise', () => {
    expect(runSummary({ ...base, run: null, resumableBranch: 'mergemate-agent/r1' })).toMatchObject({ heading: 'Agent run', primary: { kind: 'approve', label: 'Open the agent run' } });
    expect(runSummary({ ...base, run: null })).toBeNull();
  });
});
