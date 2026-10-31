import { describe, expect, it } from "vitest";
import { riskBanner, riskiestFile } from "../src/workspace/risk";
import type { PrFile, PrRisk } from "../src/types";

const file = (filename: string, additions: number, deletions = 0): PrFile => ({ filename, status: "modified", additions, deletions });
const risk = (level: PrRisk["level"], reasons: string[]): PrRisk => ({ level, reasons, coverage: { analyzedFiles: 1, skippedFiles: 0, truncatedFiles: 0 } });

describe("riskiest file", () => {
  it("prefers sensitive paths over bigger churn", () => {
    expect(riskiestFile([file("src/big.ts", 400), file("src/auth/session.ts", 5)])?.filename).toBe("src/auth/session.ts");
  });
  it("ranks tests below source of similar size", () => {
    expect(riskiestFile([file("a.test.ts", 90), file("a.ts", 60)])?.filename).toBe("a.ts");
  });
  it("is null with no loaded files", () => {
    expect(riskiestFile([])).toBeNull();
  });
});

describe("risk banner", () => {
  it("is one line with the top reason and the file to open", () => {
    const banner = riskBanner(risk("high", ["Touches sensitive areas (auth, payments or migrations)."]), [file("db/migrations/001.sql", 10)]);
    expect(banner).toEqual({ level: "high", text: "Why this is high risk: Touches sensitive areas (auth, payments or migrations).", file: "db/migrations/001.sql" });
    expect(banner?.text).not.toContain("\n");
  });
  it("offers no jump when the PR is low risk or files are not loaded", () => {
    expect(riskBanner(risk("low", ["Small change."]), [file("a.ts", 1)])?.file).toBeNull();
    expect(riskBanner(risk("medium", ["Large diff."]), [])?.file).toBeNull();
  });
  it("is absent without a risk result", () => {
    expect(riskBanner(undefined, [])).toBeNull();
  });
});
