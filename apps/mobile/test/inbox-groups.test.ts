import { describe, expect, it } from "vitest";
import { groupByRepo } from "../src/workspace/inboxGroups";
import type { Notification } from "../src/types";

const item = (id: string, repo: string) => ({ id, repo }) as Notification;

describe("inbox grouped by repo", () => {
  it("puts a counted header before each repo, busiest first, keeping item order", () => {
    const rows = groupByRepo([item("1", "a/small"), item("2", "a/big"), item("3", "a/big"), item("4", "a/small"), item("5", "a/big")]);
    expect(rows.map((row) => (row.type === "header" ? `${row.repo}:${row.count}` : row.item.id))).toEqual(["a/big:3", "2", "3", "5", "a/small:2", "1", "4"]);
  });
  it("is empty for no items", () => {
    expect(groupByRepo([])).toEqual([]);
  });
});
