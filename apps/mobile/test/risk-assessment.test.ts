import { describe, expect, it } from "vitest";
import { riskAssessmentText, secretWarningFromRisk } from "../src/api/mappers";

describe("how risk was assessed", () => {
  it("says when only the fixed rules ran", () => {
    const text = riskAssessmentText("rules");
    expect(text).toContain("Only these rules ran this time");
    expect(text).not.toContain("Meta AI then reads");
  });

  it("says AI can raise but never lower the rule-based level", () => {
    for (const assessedBy of ["rules_and_ai", undefined] as const) {
      expect(riskAssessmentText(assessedBy)).toContain("AI can raise the level, never lower what the rules found.");
    }
  });

  it("never claims checks the rules do not run", () => {
    expect(riskAssessmentText("rules_and_ai")).not.toMatch(/middleware/i);
  });
});

describe("possible-secret warning", () => {
  it("shows file and line with a masked value only", () => {
    const warning = secretWarningFromRisk({
      level: "high",
      reasons: ["x"],
      coverage: { analyzedFiles: 1, skippedFiles: 0, truncatedFiles: 0 },
      secretFindings: [{ file: "config/stripe.ts", line: 12, rule: "credential-assignment" }],
    });
    expect(warning).toMatchObject({ file: "config/stripe.ts", line: 12 });
    expect(warning?.maskedSnippet).not.toMatch(/[A-Za-z0-9]{12,}/);
  });
});
