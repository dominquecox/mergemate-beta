import { describe, expect, it } from "vitest";
import { checklistMarkdown } from "../src/workspace/checklist";

describe("review checklist as Markdown", () => {
  it("renders reading order and unchecked verify items", () => {
    const md = checklistMarkdown({ readingOrder: [{ file: "a.ts", why: "Core change" }], verify: ["Tests cover it.", "No secrets."] });
    expect(md).toBe("## Review checklist\n\n**Read in this order**\n\n1. `a.ts`: Core change\n\n**Verify before approving**\n\n- [ ] Tests cover it.\n- [ ] No secrets.\n");
  });
  it("still renders with nothing to verify", () => {
    expect(checklistMarkdown({ readingOrder: [], verify: [] })).toContain("- [ ] Nothing specific to verify");
  });
});
