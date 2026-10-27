export type DiffLineKind = "add" | "del" | "context" | "hunk";

export interface DiffLine {
  kind: DiffLineKind;
  /** New-file line number for added and context lines, old-file number for deleted lines. */
  number: number | null;
  marker: string;
  text: string;
}

/** Splits a unified-diff patch into rows with markers and line numbers, so wrapped text keeps fixed columns. */
export function parseDiff(patch: string): DiffLine[] {
  let oldLine = 0;
  let newLine = 0;
  return patch.split("\n").map((raw): DiffLine => {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      return { kind: "hunk", number: null, marker: "", text: raw };
    }
    if (raw.startsWith("+")) return { kind: "add", number: newLine++, marker: "+", text: raw.slice(1) };
    if (raw.startsWith("-")) return { kind: "del", number: oldLine++, marker: "-", text: raw.slice(1) };
    const text = raw.startsWith(" ") ? raw.slice(1) : raw;
    const line: DiffLine = { kind: "context", number: newLine, marker: "", text };
    oldLine++;
    newLine++;
    return line;
  });
}
