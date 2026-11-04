import { describe, expect, it } from "vitest";
import { ApiClientError } from "../src/api/errors";
import { aiNoticeAction, applyAiRetry } from "../src/api/aiRetry";
import type { PrDetail } from "../src/types";

const coverage = { analyzedFiles: 1, skippedFiles: 0, truncatedFiles: 0 };
const summary = { whatChanged: "w", whyItMatters: "y", suggestedFocus: [], coverage };
const risk = { level: "high" as const, reasons: ["r"], coverage, secretFindings: [{ file: "a.ts", line: 3, rule: "github-token" }] };
const base = { owner: "o", repo: "r", number: 1, aiNotice: { code: "upstream_unavailable", message: "Unavailable." } } as unknown as PrDetail;

describe("AI notice actions", () => {
  it.each([
    ["upstream_unavailable", "retry"],
    ["timeout", "retry"],
    ["network", "retry"],
    ["consent_required", "settings"],
    ["forbidden", "settings"],
    ["rate_limited", "upgrade"],
    ["misconfigured", null],
    [undefined, null],
  ] as const)("%s offers %s", (code, action) => {
    expect(aiNoticeAction(code)).toBe(action);
  });
});

describe("retrying the AI parts", () => {
  it("fills in what loaded and clears the notice when nothing is missing", () => {
    const next = applyAiRetry(base, { status: "fulfilled", value: summary }, { status: "fulfilled", value: risk });
    expect(next.summary).toEqual(summary);
    expect(next.risk).toEqual(risk);
    expect(next.secretWarning).toMatchObject({ file: "a.ts", line: 3 });
    expect(next.aiNotice).toBeUndefined();
  });

  it("keeps a part that loaded earlier and shows the new failure", () => {
    const prev = { ...base, summary } as PrDetail;
    const failure = new ApiClientError("rate_limited", "Daily AI limit reached. Resets at midnight.");
    const next = applyAiRetry(prev, null, { status: "rejected", reason: failure });
    expect(next.summary).toEqual(summary);
    expect(next.aiNotice).toEqual({ code: "rate_limited", message: "Daily AI limit reached. Resets at midnight." });
  });

  it("never shows raw text from an unexpected error", () => {
    const next = applyAiRetry(base, { status: "rejected", reason: new Error("stack trace with secrets") }, null);
    expect(next.aiNotice?.code).toBe("internal");
    expect(next.aiNotice?.message).not.toContain("stack trace");
  });
});
