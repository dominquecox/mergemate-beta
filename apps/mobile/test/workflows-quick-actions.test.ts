import { describe, expect, it } from 'vitest';
import type { WorkflowRun } from '@mergemate/contracts';
import { formatRunTime, matchRuns } from '../src/workflows/quick-actions-model';

const run = (id: string, name: string, status: string) => ({ id, status, definition: { name } }) as unknown as WorkflowRun;

describe('workflow quick actions helpers', () => {
  const runs = [run('a', 'Review PR 12', 'completed'), run('b', 'Fix flaky test', 'failed')];

  it('returns every run for an empty search', () => {
    expect(matchRuns(runs, '  ')).toHaveLength(2);
  });

  it('filters by name case-insensitively', () => {
    expect(matchRuns(runs, 'review').map((r) => r.id)).toEqual(['a']);
  });

  it('returns nothing when no run matches', () => {
    expect(matchRuns(runs, 'zzz')).toEqual([]);
  });

  it('formats a valid time and tolerates a bad one', () => {
    expect(formatRunTime('2025-01-02T03:04:05Z')).not.toBe('');
    expect(formatRunTime('not a date')).toBe('');
  });
});

describe('workflows page wiring', () => {
  const fs = require('node:fs') as typeof import('node:fs');
  const path = require('node:path') as typeof import('node:path');
  const page = fs.readFileSync(path.resolve(__dirname, '../app/workflows.tsx'), 'utf8');
  const actions = fs.readFileSync(path.resolve(__dirname, '../src/workflows/QuickActions.tsx'), 'utf8');

  it('opens a run from Recent runs in place, so the receipt shows without a remount', () => {
    expect(page).toContain('onOpenRun={(run) => void workspace.selectRun(run)}');
    expect(page).not.toMatch(/onOpenRun=\{[^}]*router\.push/);
  });

  it('offers Templates next to Saved, Recent runs and Capabilities and loads them into the composer', () => {
    expect(page).toContain('onUseTemplate={chooseTemplate}');
    expect(page).toMatch(/template\.mode === 'review'/);
    const order = ['trigger(\'saved\'', 'trigger(\'runs\'', 'trigger(\'templates\'', 'trigger(\'capabilities\''].map((needle) => actions.indexOf(needle));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});

describe('quick action dialogs', () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'src', 'workflows', 'QuickActions.tsx'), 'utf8') as string;
  it('drops a half-confirmed delete when the Saved menu closes', () => {
    expect(source).toContain("if (which === 'saved' && pendingDelete) onCancelDelete();");
  });
  it('keeps the dismiss backdrop out of the accessibility tree and gives every dialog its own close button', () => {
    expect(source.match(/<Pressable accessible=\{false\} importantForAccessibility="no" aria-hidden onPress=\{close\}/g)).toHaveLength(4);
    expect(source).not.toMatch(/<Pressable accessibilityRole="button" accessibilityLabel="Close [a-z ]+" onPress=\{close\} style=\{\{ flex: 1/);
    for (const label of ['Close saved workflows', 'Close templates', 'Close recent runs', 'Close capabilities']) expect(source).toContain(`accessibilityLabel="${label}"`);
  });
});
