import { describe, expect, it } from 'vitest';
import type { Card } from '@mergemate/contracts';
import { emptyDraft, movedPosition, toCreateRequest, toUpdateRequest, validateRules } from '../src/brain/cardForm';

const card = { id: 'c1', title: 'A', details: 'd', priority: 'P1', doneWhen: 'x' } as Card;

describe('brain card form', () => {
  it('requires a title and trims on create', () => {
    expect(toCreateRequest('p', emptyDraft()).ok).toBe(false);
    const ok = toCreateRequest('p', { ...emptyDraft(), title: '  Ship  ', details: 'why', doneWhen: 'merged' });
    expect(ok.ok && ok.value.title).toBe('Ship');
  });

  it('rejects an over-long title', () => {
    expect(toCreateRequest('p', { ...emptyDraft(), title: 'x'.repeat(161) })).toEqual({ ok: false, error: 'Title is too long.' });
  });

  it('sends only changed fields on update and refuses no-ops', () => {
    const same = { title: 'A', details: 'd', priority: 'P1' as const, doneWhen: 'x' };
    expect(toUpdateRequest('p', card, same).ok).toBe(false);
    const r = toUpdateRequest('p', card, { ...same, priority: 'P0' });
    expect(r.ok && r.value).toEqual({ projectId: 'p', cardId: 'c1', priority: 'P0' });
  });

  it('validates rules', () => {
    expect(validateRules('  ').ok).toBe(false);
    expect(validateRules('x'.repeat(20481)).ok).toBe(false);
    expect(validateRules(' ok ')).toEqual({ ok: true, value: 'ok' });
  });

  it('computes reorder targets and stops at the ends', () => {
    const cards = [{ id: 'a' }, { id: 'b' }, { id: 'c' }] as Card[];
    expect(movedPosition(cards, 'b', -1)).toBe(0);
    expect(movedPosition(cards, 'a', -1)).toBeNull();
    expect(movedPosition(cards, 'c', 1)).toBeNull();
  });
});

describe('mock proceed', () => {
  it('returns a locked card that satisfies the contract', async () => {
    const { mockClient } = await import('../src/api/mock');
    const { ProceedWithTrackResponseSchema } = await import('@mergemate/contracts');
    const res = await mockClient.proceedBrain('proj-1');
    expect(ProceedWithTrackResponseSchema.safeParse(res).success).toBe(true);
    expect(res.lock.cardId).toBe(res.card.id);
  });
});
