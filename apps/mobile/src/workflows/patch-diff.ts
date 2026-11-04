export type DiffRow =
  | { kind: 'add' | 'del' | 'ctx'; text: string; oldLine?: number; newLine?: number }
  | { kind: 'gap'; hidden: number }
  | { kind: 'note'; text: string };

/**
 * Turns the server's unified diff into display rows. Lines between hunks are shown as one collapsed "N unchanged lines" row.
 * This is display only: the approval still binds the exact patch hash and files.
 */
export function parseUnifiedDiff(diff: string): { rows: DiffRow[]; added: number; removed: number } {
  const rows: DiffRow[] = [];
  let added = 0, removed = 0, oldNo = 0, newNo = 0, nextOld = 1, seenHunk = false;
  for (const line of diff.split('\n')) {
    const head = /^@@ -(\d+),(\d+) \+(\d+),(\d+) @@$/.exec(line);
    if (head) {
      const start = Number(head[2]) === 0 ? Number(head[1]) + 1 : Number(head[1]);
      const hidden = start - nextOld;
      if (hidden > 0 && (seenHunk || start > 1)) rows.push({ kind: 'gap', hidden });
      seenHunk = true;
      oldNo = start;
      newNo = Number(head[4]) === 0 ? Number(head[3]) + 1 : Number(head[3]);
      nextOld = start + Number(head[2]);
      continue;
    }
    if (!seenHunk) continue;
    const mark = line[0], text = line.slice(1);
    if (mark === '+') { added += 1; rows.push({ kind: 'add', text, newLine: newNo++ }); }
    else if (mark === '-') { removed += 1; rows.push({ kind: 'del', text, oldLine: oldNo++ }); }
    else if (mark === ' ') rows.push({ kind: 'ctx', text, oldLine: oldNo++, newLine: newNo++ });
    else if (mark === '\\') rows.push({ kind: 'note', text: line.slice(2) });
  }
  return { rows, added, removed };
}

/** The diff the server sent for a file, if any. Files without one fall back to showing the proposed file. */
export const diffForPath = (diffs: readonly { path: string; diff: string }[] | undefined, path: string): string | null =>
  diffs?.find((item) => item.path === path)?.diff || null;
