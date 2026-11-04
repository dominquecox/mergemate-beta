import { describe, expect, it } from "vitest";
import { groupByRepo } from "../src/workspace/inboxGroups";
import type { Notification } from "../src/types";

const item = (id: string, repo: string, opts?: Partial<Notification>): Notification => 
  ({id, repo, kind: "mention", risk: undefined, ...opts} as Notification);

describe("inbox grouped by repo", () => {
  it("shows needs-attention section at top with high-risk + review items, then repo groups (repo count reflects non-needs-attention items only)", () => {
    // Items 3, 2, 4 will go to needs-attention (high-risk or review)
    // Items 1, 5 remain in repo groups
    // a/big: items 3, 2 (needs-attention), 5 (stays) → count=1 in repo group
    // a/small: items 1 (stays), 4 (needs-attention) → count=1 in repo group
    const rows = groupByRepo([
      item("1", "a/small", {kind: "mention"}),
      item("2", "a/big", {kind: "review", risk: "medium"}),
      item("3", "a/big", {kind: "mention", risk: "high"}),
      item("4", "a/small", {kind: "review"}),
      item("5", "a/big", {kind: "mention"}),
    ]);
    // Expected: "Needs attention" section (items 3, 2, 4 sorted by urgency), then repo groups (only non-needs-attention items)
    // Item 3: high risk > Item 2: medium + review > Item 4: review (no risk)
    // Then a/big:1 (item 5), then a/small:1 (item 1)
    expect(rows.map((row) => {
      if (row.type === "section") return `[${row.label}]`;
      if (row.type === "header") return `${row.repo}:${row.count}`;
      return row.item.id;
    })).toEqual([
      "[Needs attention]",
      "3",  // high risk
      "2",  // medium risk + review
      "4",  // review (no risk)
      "a/big:1",  // only item 5 remains (items 2, 3 in needs-attention)
      "5",
      "a/small:1",  // only item 1 remains (item 4 in needs-attention)
      "1",
    ]);
  });
  it("sorts within same risk by kind (review > mention > mine)", () => {
    const rows = groupByRepo([
      item("1", "a/repo", {kind: "mine", risk: "high"}),
      item("2", "a/repo", {kind: "review", risk: "high"}),
      item("3", "a/repo", {kind: "mention", risk: "high"}),
    ]);
    // Expected: all high risk in needs-attention, sorted by kind: review > mention > mine
    // No repo group since all items in needs-attention
    expect(rows.map((row) => (row.type === "section" ? "section" : row.type === "header" ? "header" : row.item.id))).toEqual([
      "section", "2", "3", "1"
    ]);
  });
  it("is empty for no items", () => {
    expect(groupByRepo([])).toEqual([]);
  });
  it("handles empty needs-attention (no high risk or review items)", () => {
    const rows = groupByRepo([
      item("1", "a/repo", {kind: "mention", risk: "low"}),
      item("2", "a/repo", {kind: "mention", risk: "medium"}),
    ]);
    // Expected: no needs-attention section, just repo group
    expect(rows.map((row) => {
      if (row.type === "section") return "section";
      if (row.type === "header") return "header";
      return row.item.id;
    })).toEqual([
      "header",  // a/repo:2
      "2",  // medium risk first
      "1",  // low risk
    ]);
  });
});
