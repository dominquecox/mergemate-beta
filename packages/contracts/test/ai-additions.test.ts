import {
  ConsentState,
  ConsentUpdate,
  HighlightRegion,
  HighlightResult,
  ModelHighlight,
  ModelTriage,
  QualityCheck,
  SecretFinding,
  TriageItem,
  TriageRecord,
} from "../src/index";
import { describe, expect, it } from "vitest";

describe("MM-009 contract additions", () => {
  it("parses consent state and updates", () => {
    expect(ConsentState.parse({ ai: { granted: false, version: "1" } }).ai.granted).toBe(false);
    expect(
      ConsentState.parse({ ai: { granted: true, version: "1", at: "2026-10-26T12:00:00Z" } }).ai.at,
    ).toBe("2026-10-26T12:00:00Z");
    expect(ConsentUpdate.safeParse({ ai: { granted: true, version: "" } }).success).toBe(false);
  });

  it("keeps secret findings value-free and quality optional on risk", () => {
    expect(SecretFinding.parse({ file: "a.ts", line: 3, rule: "github-token" }).line).toBe(3);
    expect(SecretFinding.safeParse({ file: "a.ts", line: 0, rule: "r" }).success).toBe(false);
    expect(QualityCheck.parse({ needsCloserLook: true, reasons: ["x"] }).needsCloserLook).toBe(true);
  });

  it("parses highlight results and triage records", () => {
    expect(HighlightResult.parse({ insight: "moved", requestId: "r1" }).insight).toBe("moved");
    expect(HighlightResult.parse({ insight: "moved", requestId: "r1" }).regions).toEqual([]);
    expect(TriageRecord.parse({ prRef: "octo/demo#1", lane: "ignore" }).lane).toBe("ignore");
    expect(TriageRecord.safeParse({ prRef: "bad", lane: "ignore" }).success).toBe(false);
  });

  it("validates highlight regions as non-empty 0-1000 boxes", () => {
    const box = { xMin: 10, yMin: 20, xMax: 200, yMax: 80, label: "Checkout button" };
    expect(HighlightRegion.parse(box).label).toBe("Checkout button");
    expect(ModelHighlight.parse({ explanation: "clear", regions: [box] }).regions).toHaveLength(1);
    expect(ModelHighlight.parse({ explanation: "clear" }).regions).toEqual([]);
    expect(HighlightRegion.safeParse({ ...box, xMax: 10 }).success).toBe(false);
    expect(HighlightRegion.safeParse({ ...box, xMin: -1 }).success).toBe(false);
    expect(HighlightRegion.safeParse({ ...box, xMax: 1001 }).success).toBe(false);
  });

  it("adds optional triage reasons and source without changing the old shape", () => {
    expect(TriageItem.parse({ prRef: "octo/demo#1", lane: "fyi", reason: "x" }).source).toBeUndefined();
    const full = TriageItem.parse({ prRef: "octo/demo#1", lane: "fyi", reason: "x", reasons: ["x"], source: "ai", title: "t", author: "a" });
    expect(full.source).toBe("ai");
    expect(TriageItem.safeParse({ prRef: "octo/demo#1", lane: "fyi", reason: "x", source: "other" }).success).toBe(false);
    expect(ModelTriage.safeParse({ lane: "needs_you", reasons: [] }).success).toBe(false);
    expect(ModelTriage.parse({ lane: "ignore", reasons: ["r"] }).lane).toBe("ignore");
  });
});
