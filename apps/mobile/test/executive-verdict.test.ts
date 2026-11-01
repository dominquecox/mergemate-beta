import { describe, expect, it } from "vitest";
import { getExecutiveVerdict } from "../src/workspace/executiveVerdict";
import type { PrCheck, PrFile, PrRisk, SecretLeakWarning } from "../src/types";

const makeFile = (filename: string, additions = 10, deletions = 0): PrFile => ({
  filename,
  status: "modified",
  additions,
  deletions,
});

const makeRisk = (level: PrRisk["level"], reasons: string[]): PrRisk => ({
  level,
  reasons,
  coverage: { analyzedFiles: 1, skippedFiles: 0, truncatedFiles: 0 },
});

describe("getExecutiveVerdict", () => {
  it("requires desktop review for absent risk or incomplete checks",()=>{
    expect(getExecutiveVerdict({}).level).toBe("caution");
    expect(getExecutiveVerdict({risk:makeRisk("low",["Docs"]),checks:[{id:"1",name:"CI",status:"in_progress",conclusion:"pending"}]}).level).toBe("caution");
  });
  it("flags secret exposure as blocked high risk", () => {
    const secretWarning: SecretLeakWarning = {
      file: "config/stripe.ts",
      line: 12,
      rule: "stripe_live_key",
      maskedSnippet: "sk_live_••••••••",
    };
    const verdict = getExecutiveVerdict({
      secretWarning,
      files: [makeFile("config/stripe.ts")],
    });
    expect(verdict.level).toBe("blocked");
    expect(verdict.tone).toBe("red");
    expect(verdict.headline).toContain("SECRET EXPOSURE");
  });

  it("flags CI check failure as blocked high risk", () => {
    const checks: PrCheck[] = [
      { id: "1", name: "lint", status: "completed", conclusion: "success" },
      { id: "2", name: "test-unit", status: "completed", conclusion: "failure" },
    ];
    const verdict = getExecutiveVerdict({
      checks,
      files: [makeFile("src/index.ts")],
    });
    expect(verdict.level).toBe("blocked");
    expect(verdict.tone).toBe("red");
    expect(verdict.headline).toContain("CI CHECKS FAILING");
    expect(verdict.reasons[0]).toContain("test-unit");
  });

  it("flags sensitive blast radius files as high risk senior review", () => {
    const verdict = getExecutiveVerdict({
      risk: makeRisk("high", ["Touches authentication routing"]),
      files: [makeFile("src/auth/session.ts", 40)],
    });
    expect(verdict.level).toBe("blocked");
    expect(verdict.tone).toBe("red");
    expect(verdict.headline).toContain("HIGH RISK");
  });

  it("flags medium risk as caution review on desktop", () => {
    const verdict = getExecutiveVerdict({
      risk: makeRisk("medium", ["Large diff across 12 files"]),
      files: [makeFile("src/components/Header.tsx", 150)],
    });
    expect(verdict.level).toBe("caution");
    expect(verdict.tone).toBe("yellow");
    expect(verdict.headline).toContain("REVIEW ON DESKTOP");
  });

  it("marks low risk docs and test changes as safe to ship", () => {
    const verdict = getExecutiveVerdict({
      risk: makeRisk("low", ["Documentation change"]),
      files: [makeFile("README.md", 5)],
      checks: [{ id: "1", name: "ci", status: "completed", conclusion: "success" }],
    });
    expect(verdict.level).toBe("safe");
    expect(verdict.tone).toBe("green");
    expect(verdict.headline).toContain("SAFE TO SHIP");
  });
});
