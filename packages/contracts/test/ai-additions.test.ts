import {
  ConsentState,
  ConsentUpdate,
  HighlightResult,
  QualityCheck,
  SecretFinding,
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
    expect(TriageRecord.parse({ prRef: "octo/demo#1", lane: "ignore" }).lane).toBe("ignore");
    expect(TriageRecord.safeParse({ prRef: "bad", lane: "ignore" }).success).toBe(false);
  });
});
