import { describe, expect, it } from 'vitest';
import { fileDiffs, unifiedDiff } from '../src/workflows/unified-diff';

/** Applies a diff made by unifiedDiff back onto the original, so the tests prove it is a correct diff. */
function apply(before: string, diff: string): string {
  const src = before.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const out: string[] = [];
  let pos = 0;
  const lines = diff.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const head = /^@@ -(\d+),(\d+) \+\d+,\d+ @@$/.exec(line);
    if (head) {
      const start = Number(head[2]) === 0 ? Number(head[1]) : Number(head[1]) - 1;
      while (pos < start) out.push(src[pos++] ?? '');
      continue;
    }
    if (line.startsWith('\\')) continue;
    const mark = line[0], text = line.slice(1), noNewline = lines[i + 1]?.startsWith('\\');
    if (mark === ' ') { out.push(src[pos++] ?? ''); }
    else if (mark === '-') pos += 1;
    else if (mark === '+') out.push(noNewline ? text : `${text}\n`);
  }
  while (pos < src.length) out.push(src[pos++] ?? '');
  return out.join('');
}

const numbered = (n: number) => Array.from({ length: n }, (_, i) => `line ${i + 1}\n`).join('');

describe('unified diff', () => {
  it('is empty for equal text', () => expect(unifiedDiff('a\nb\n', 'a\nb\n')).toBe(''));

  it('marks removed and added lines with 3 lines of context', () => {
    const before = numbered(20), after = before.replace('line 10\n', 'line ten\n');
    const diff = unifiedDiff(before, after) ?? "";
    expect(diff.split('\n')).toEqual([
      '@@ -7,7 +7,7 @@', ' line 7', ' line 8', ' line 9', '-line 10', '+line ten', ' line 11', ' line 12', ' line 13',
    ]);
    expect(apply(before, diff)).toBe(after);
  });

  it('merges nearby changes into one hunk and splits far ones', () => {
    const before = numbered(40);
    const near = before.replace('line 10\n', 'A\n').replace('line 14\n', 'B\n');
    expect((unifiedDiff(before, near) ?? '').match(/^@@/gm)).toHaveLength(1);
    const far = before.replace('line 5\n', 'A\n').replace('line 35\n', 'B\n');
    const diff = unifiedDiff(before, far) ?? "";
    expect(diff.match(/^@@/gm)).toHaveLength(2);
    expect(apply(before, diff)).toBe(far);
  });

  it('handles pure additions, deletions, a new first line and a missing final newline', () => {
    for (const [before, after] of [
      ['', 'new\n'], ['gone\n', ''], ['a\nb\n', 'x\na\nb\n'], ['a\nb', 'a\nb\n'], ['a\nb\n', 'a\nb'], ['a\nb\nc\n', 'a\nc\n'],
    ] as const) {
      const diff = unifiedDiff(before, after) ?? "";
      expect(apply(before, diff)).toBe(after);
    }
    expect(unifiedDiff('a\nb', 'a\nb\n')).toContain('\\ No newline at end of file');
  });

  it('round-trips a larger scattered edit', () => {
    const before = numbered(300);
    let after = before;
    for (const n of [3, 50, 51, 120, 299]) after = after.replace(`line ${n}\n`, `changed ${n}\ninserted\n`);
    after = after.replace('line 200\n', '');
    expect(apply(before, unifiedDiff(before, after) ?? "")).toBe(after);
  });

  it('returns null instead of a huge diff', () => {
    expect(unifiedDiff(numbered(5000), 'x\n')).toBeNull();
    expect(unifiedDiff(numbered(3000), numbered(3000).replace(/line/g, 'other'))).toBeNull();
  });

  it('leaves out files with no known base or no change', () => {
    const base = new Map([['a.ts', 'one\n'], ['b.ts', 'same\n']]);
    const result = fileDiffs(base, [
      { path: 'a.ts', content: 'two\n' }, { path: 'b.ts', content: 'same\n' }, { path: 'c.ts', content: 'new\n' },
    ]);
    expect(result).toEqual([{ path: 'a.ts', diff: '@@ -1,1 +1,1 @@\n-one\n+two' }]);
  });
});
