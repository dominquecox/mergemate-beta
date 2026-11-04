import { describe, expect, it } from 'vitest';
import { PatchProposal } from '../src/workflows/api';
import { diffForPath, parseUnifiedDiff } from '../src/workflows/patch-diff';
import { allPatchFilesReviewed } from '../src/workflows/patch-review';

const diff = ['@@ -4,7 +4,7 @@', ' a', ' b', ' c', '-old', '+new', ' d', ' e', ' f', '@@ -30,3 +30,4 @@', ' x', '+added', ' y', ' z', '\\ No newline at end of file'].join('\n');

describe('patch diff rows', () => {
  it('colours adds and removes, numbers lines and counts them', () => {
    const { rows, added, removed } = parseUnifiedDiff(diff);
    expect([added, removed]).toEqual([2, 1]);
    expect(rows.find((r) => r.kind === 'del')).toMatchObject({ text: 'old', oldLine: 7 });
    expect(rows.find((r) => r.kind === 'add')).toMatchObject({ text: 'new', newLine: 7 });
  });
  it('collapses the unchanged lines before the first hunk and between hunks', () => {
    const gaps = parseUnifiedDiff(diff).rows.filter((r) => r.kind === 'gap');
    expect(gaps).toEqual([{ kind: 'gap', hidden: 3 }, { kind: 'gap', hidden: 19 }]);
  });
  it('keeps the no-newline note and ignores an empty diff', () => {
    expect(parseUnifiedDiff(diff).rows.at(-1)).toEqual({ kind: 'note', text: 'No newline at end of file' });
    expect(parseUnifiedDiff('').rows).toEqual([]);
  });
  it('finds the diff for a path and falls back when there is none', () => {
    expect(diffForPath([{ path: 'a.ts', diff }], 'a.ts')).toBe(diff);
    expect(diffForPath([{ path: 'a.ts', diff }], 'b.ts')).toBeNull();
    expect(diffForPath(undefined, 'a.ts')).toBeNull();
  });
});

describe('patch proposal with diffs', () => {
  const base = { runId: 'r', jobId: 'j', repository: 'o/r', repositoryId: 1, headSha: 'a'.repeat(40), patchHash: 'b'.repeat(64), action: 'qa_and_draft_pr', summary: 's', changes: [{ path: 'a.ts', content: 'x' }, { path: 'b.ts', content: 'y' }] };
  it('accepts an older response with no diffs', () => expect(PatchProposal.parse(base).diffs).toBeUndefined());
  it('keeps "N of M files inspected" gating on the files, not on the diffs', () => {
    const proposal = PatchProposal.parse({ ...base, diffs: [{ path: 'a.ts', diff }] });
    expect(allPatchFilesReviewed(proposal, ['a.ts'])).toBe(false);
    expect(allPatchFilesReviewed(proposal, ['a.ts', 'b.ts'])).toBe(true);
  });
});
