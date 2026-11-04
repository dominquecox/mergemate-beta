/**
 * Display-only unified diff for the patch review screen. It is never part of what is approved:
 * the approval binds the patch hash and the exact files, not this text.
 */
export const DIFF_CONTEXT_LINES = 3;
/** Beyond these limits no diff is produced and the screen shows the proposed file as before. */
export const DIFF_MAX_LINES = 4000;
export const DIFF_MAX_EDITS = 1500;
export const DIFF_MAX_BYTES = 48 * 1024;

const at = (list: Int32Array, i: number): number => list[i] ?? 0;
const line = (list: string[], i: number): string => list[i] ?? "";

type Op = { t: " " | "-" | "+"; text: string; a: number; b: number };

const splitLines = (text: string): string[] => text.match(/[^\n]*\n|[^\n]+$/g) ?? [];

/** Shortest edit script (Myers). Returns null when the files differ by more than DIFF_MAX_EDITS lines. */
function edits(a: string[], b: string[]): Op[] | null {
  const n = a.length, m = b.length, max = Math.min(n + m, DIFF_MAX_EDITS);
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace: Int32Array[] = [];
  let found = -1;
  for (let d = 0; d <= max && found < 0; d += 1) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && at(v, offset + k - 1) < at(v, offset + k + 1)) ? at(v, offset + k + 1) : at(v, offset + k - 1) + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x += 1; y += 1; }
      v[offset + k] = x;
      if (x >= n && y >= m) { found = d; break; }
    }
  }
  if (found < 0) return null;
  const ops: Op[] = [];
  let x = n, y = m;
  for (let d = found; d > 0; d -= 1) {
    const prev = trace[d] ?? v;
    const k = x - y;
    const down = k === -d || (k !== d && at(prev, offset + k - 1) < at(prev, offset + k + 1));
    const pk = down ? k + 1 : k - 1;
    const px = at(prev, offset + pk), py = px - pk;
    while (x > px && y > py && (x - 1 !== px || y - 1 !== py) && a[x - 1] === b[y - 1]) {
      x -= 1; y -= 1; ops.push({ t: " ", text: line(a, x), a: x, b: y });
    }
    if (down) { y -= 1; ops.push({ t: "+", text: line(b, y), a: x, b: y }); }
    else { x -= 1; ops.push({ t: "-", text: line(a, x), a: x, b: y }); }
  }
  while (x > 0 && y > 0) { x -= 1; y -= 1; ops.push({ t: " ", text: line(a, x), a: x, b: y }); }
  return ops.reverse();
}

const render = (line: string, mark: string) => (line.endsWith("\n") ? `${mark}${line.slice(0, -1)}` : `${mark}${line}\n\\ No newline at end of file`);

/**
 * Unified diff of `before` to `after` with `context` lines around each change.
 * Returns "" when the texts are equal and null when the diff is too large to show.
 */
export function unifiedDiff(before: string, after: string, context = DIFF_CONTEXT_LINES): string | null {
  if (before === after) return "";
  const a = splitLines(before), b = splitLines(after);
  if (a.length > DIFF_MAX_LINES || b.length > DIFF_MAX_LINES) return null;
  const ops = edits(a, b);
  if (!ops) return null;
  const changed = ops.map((op, i) => (op.t === " " ? -1 : i)).filter((i) => i >= 0);
  if (!changed.length) return "";
  const out: string[] = [];
  let i = 0;
  while (i < changed.length) {
    const firstChange = changed[i] ?? 0;
    const from = Math.max(0, firstChange - context);
    let to = Math.min(ops.length, firstChange + context + 1);
    let j = i + 1;
    while (j < changed.length && (changed[j] ?? 0) - context <= to) { to = Math.min(ops.length, (changed[j] ?? 0) + context + 1); j += 1; }
    const slice = ops.slice(from, to);
    const oldLen = slice.filter((op) => op.t !== "+").length, newLen = slice.filter((op) => op.t !== "-").length;
    const first = slice[0];
    if (!first) break;
    out.push(`@@ -${oldLen ? first.a + 1 : first.a},${oldLen} +${newLen ? first.b + 1 : first.b},${newLen} @@`);
    for (const op of slice) out.push(render(op.text, op.t));
    i = j;
  }
  const text = out.join("\n");
  return new TextEncoder().encode(text).length > DIFF_MAX_BYTES ? null : text;
}

export interface FileDiff { path: string; diff: string }

/** Diffs for display; a file is left out when its base is unknown or the diff is too large, and the screen then shows the proposed file. */
export function fileDiffs(base: ReadonlyMap<string, string>, changes: readonly { path: string; content: string }[]): FileDiff[] {
  const result: FileDiff[] = [];
  for (const change of changes) {
    const before = base.get(change.path);
    if (before === undefined) continue;
    const diff = unifiedDiff(before, change.content);
    if (diff) result.push({ path: change.path, diff });
  }
  return result;
}
