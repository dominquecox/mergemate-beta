import type {Notification} from "../types";

export type InboxRow =
  | {type: "header"; repo: string; count: number}
  | {type: "item"; item: Notification};

/** Groups items by repo (busiest first, then name), keeping the incoming order inside each group. */
export function groupByRepo(items: readonly Notification[]): InboxRow[] {
  const groups = new Map<string, Notification[]>();
  for (const item of items) groups.set(item.repo, [...(groups.get(item.repo) ?? []), item]);
  return [...groups.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .flatMap(([repo, rows]): InboxRow[] => [{type: "header", repo, count: rows.length}, ...rows.map((item): InboxRow => ({type: "item", item}))]);
}
