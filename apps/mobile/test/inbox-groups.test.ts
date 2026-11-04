import { describe, expect, it } from "vitest";
import { groupByRepo } from "../src/workspace/inboxGroups";
import type { Notification } from "../src/types";

const item = (id: string, repo: string, opts?: Partial<Notification>): Notification => 
  ({id, repo, kind: "mention", risk: undefined, ...opts} as Notification);

describe("inbox grouped by repo", () => {
  it("puts a counted header before each repo, busiest first, with urgency sorting within repos", () => {
    // Create items: repo a/big has 3 items, repo a/small has 2 items
    // Within a/big: one high risk, one medium risk, one no risk
    // They should sort high > medium > no risk
    const rows = groupByRepo([
      item("1", "a/small", {kind: "mention"}),
      item("2", "a/big", {kind: "review", risk: "medium"}),
      item("3", "a/big", {kind: "mention", risk: "high"}),
      item("4", "a/small", {kind: "review"}),
      item("5", "a/big", {kind: "mention"}),
    ]);
    // Expected: a/big header with 3 items, sorted high > medium > none; then a/small header with 2 items
    expect(rows.map((row) => (row.type === "header" ? `${row.repo}:${row.count}` : row.item.id))).toEqual([
      "a/big:3",
      "3",  // id 3: high risk
      "2",  // id 2: medium risk
      "5",  // id 5: no risk
      "a/small:2",
      "4",  // id 4: review (higher kind priority)
      "1",  // id 1: mention (lower kind priority)
    ]);
  });
  it("sorts within same risk by kind (review > mention > mine)", () => {
    const rows = groupByRepo([
      item("1", "a/repo", {kind: "mine", risk: "high"}),
      item("2", "a/repo", {kind: "review", risk: "high"}),
      item("3", "a/repo", {kind: "mention", risk: "high"}),
    ]);
    // Expected: all high risk, sorted by kind: review > mention > mine
    expect(rows.map((row) => (row.type === "header" ? "header" : row.item.id))).toEqual([
      "header", "2", "3", "1"
    ]);
  });
  it("is empty for no items", () => {
    expect(groupByRepo([])).toEqual([]);
  });
});
