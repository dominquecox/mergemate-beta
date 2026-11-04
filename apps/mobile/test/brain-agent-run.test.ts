import { describe, expect, it } from 'vitest';
import { BrainRunResponseSchema, type BrainRunStatus, type Card, type Lock } from '@mergemate/contracts';
import { POLL_INTERVAL_MS, POLL_LIMIT_MS, approveRunPath, draftPrUrl, nextWatch, primaryAction, safeHttpsUrl } from '../src/brain/agentRun';
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
