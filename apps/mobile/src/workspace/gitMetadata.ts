/**
 * Git metadata formatting helpers for Apple Developer & GitHub HIG.
 */

export function formatCommitSha(sha: string | undefined): string | undefined {
  if (!sha || typeof sha !== "string") return undefined;
  return sha.trim().slice(0, 7);
}

export function formatDiffStat(additions: number, deletions: number): { added: string; deleted: string; net: string } {
  const safeAdd = Number.isFinite(additions) ? Math.max(0, additions) : 0;
  const safeDel = Number.isFinite(deletions) ? Math.max(0, deletions) : 0;
  const netDiff = safeAdd - safeDel;
  return {
    added: `+${safeAdd}`,
    deleted: `-${safeDel}`,
    net: netDiff >= 0 ? `+${netDiff}` : `${netDiff}`,
  };
}

export function formatFileCount(count: number | undefined): string | undefined {
  if (typeof count !== "number" || !Number.isFinite(count) || count < 0) return undefined;
  return `${count} ${count === 1 ? "file" : "files"}`;
}

export function formatBranchLineage(base: string, head: string): { base: string; head: string } {
  return {
    base: base.trim(),
    head: head.trim(),
  };
}
