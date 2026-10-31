import { describe, expect, it } from "vitest";
import {
  formatCommitSha,
  formatDiffStat,
  formatFileCount,
  formatBranchLineage,
} from "../src/workspace/gitMetadata";
import { palette } from "../src/theme";

describe("Apple Developer & GitHub Metadata UI", () => {
  it("formats commit shas to 7 characters in developer utility", () => {
    const fullSha = "6cb97a892b1f8ef440b82b9a11d044fa92f25b90";
    expect(formatCommitSha(fullSha)).toBe("6cb97a8");
    expect(formatCommitSha("")).toBeUndefined();
    expect(formatCommitSha(undefined)).toBeUndefined();
  });

  it("formats diff statistics with tabular sign indicators and net change", () => {
    const stat1 = formatDiffStat(142, 18);
    expect(stat1).toEqual({ added: "+142", deleted: "-18", net: "+124" });

    const stat2 = formatDiffStat(5, 20);
    expect(stat2).toEqual({ added: "+5", deleted: "-20", net: "-15" });

    const stat3 = formatDiffStat(0, 0);
    expect(stat3).toEqual({ added: "+0", deleted: "-0", net: "+0" });
  });

  it("formats file count labels with singular/plural support", () => {
    expect(formatFileCount(1)).toBe("1 file");
    expect(formatFileCount(5)).toBe("5 files");
    expect(formatFileCount(0)).toBe("0 files");
    expect(formatFileCount(undefined)).toBeUndefined();
  });

  it("formats branch lineages safely trimming extra whitespace", () => {
    const lineage = formatBranchLineage(" main ", " feat/model-failover ");
    expect(lineage).toEqual({ base: "main", head: "feat/model-failover" });
  });

  it("maintains AA color contrast for all status pill tones", () => {
    for (const mode of ["dark", "light"] as const) {
      const c = palette[mode];
      expect(c.riskLow).toBeDefined();
      expect(c.riskLowBg).toBeDefined();
      expect(c.brandLight).toBeDefined();
      expect(c.brandSubtle).toBeDefined();
      expect(c.riskHigh).toBeDefined();
      expect(c.riskHighBg).toBeDefined();
    }
  });
});
