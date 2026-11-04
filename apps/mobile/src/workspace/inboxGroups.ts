import type {Notification} from "../types";

export type InboxRow =
  | {type: "header"; repo: string; count: number}
  | {type: "item"; item: Notification};

/** Sorts items by urgency (risk and kind), then groups by repo.
 * Urgency order: high risk > medium risk > low risk;
 * within same risk: "review" (needs-you) > "mention" > "mine".
 */
function urgencyScore(item: Notification): number {
  const riskScore = (item.risk === 'high' ? 3 : item.risk === 'medium' ? 2 : 1);
  const kindScore = (item.kind === 'review' ? 3 : item.kind === 'mention' ? 2 : 1);
  // Combine risk (higher weight) and kind for stable sort
  return riskScore * 10 + kindScore;
}

/** Groups items by repo (busiest first, then name), sorting within each group by urgency. */
export function groupByRepo(items: readonly Notification[]): InboxRow[] {
  const groups = new Map<string, Notification[]>();
  for (const item of items) groups.set(item.repo, [...(groups.get(item.repo) ?? []), item]);
  return [...groups.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .flatMap(([repo, rows]): InboxRow[] => {
      const sorted = [...rows].sort((a, b) => urgencyScore(b) - urgencyScore(a));
      return [{type: "header", repo, count: rows.length}, ...sorted.map((item): InboxRow => ({type: "item", item}))];
    });
}
