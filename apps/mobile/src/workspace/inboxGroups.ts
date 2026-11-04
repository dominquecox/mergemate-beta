import type {Notification} from "../types";

export type InboxRow =
  | {type: "header"; repo: string; count: number}
  | {type: "section"; label: string}
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

/** True if item needs attention: high risk or kind=review (needs-you). */
function needsAttention(item: Notification): boolean {
  return item.risk === 'high' || item.kind === 'review';
}

/** Groups items by repo (busiest first, then name), sorting within each group by urgency.
 * Shows a "Needs attention" section at top with high-risk + review items across all repos.
 */
export function groupByRepo(items: readonly Notification[]): InboxRow[] {
  // Separate items: needs attention vs. others
  const attention = items.filter(needsAttention);
  const others = items.filter(item => !needsAttention(item));
  
  // Sort needs-attention items by urgency
  const sortedAttention = [...attention].sort((a, b) => urgencyScore(b) - urgencyScore(a));
  
  // Build needs-attention section if non-empty
  const rows: InboxRow[] = [];
  if (sortedAttention.length > 0) {
    rows.push({type: "section", label: "Needs attention"});
    rows.push(...sortedAttention.map((item): InboxRow => ({type: "item", item})));
  }
  
  // Group other items by repo (busiest first, then name), sorted by urgency within each repo
  const groups = new Map<string, Notification[]>();
  for (const item of others) {
    groups.set(item.repo, [...(groups.get(item.repo) ?? []), item]);
  }
  
  // Add repo groups
  for (const [repo, repoItems] of [...groups.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))) {
    const sorted = [...repoItems].sort((a, b) => urgencyScore(b) - urgencyScore(a));
    rows.push({type: "header", repo, count: repoItems.length});
    rows.push(...sorted.map((item): InboxRow => ({type: "item", item})));
  }
  
  return rows;
}
