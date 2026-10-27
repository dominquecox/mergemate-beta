import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseDiff } from "../src/components/diffLines";
import { requiresSession } from "../src/layout/breakpoints";

describe("MM-048 diff rows", () => {
  it("numbers added, deleted and context lines from the hunk header", () => {
    const rows = parseDiff("@@ -10,3 +20,3 @@ fn\n ctx\n-old\n+new\n tail");
    expect(rows.map((r) => [r.kind, r.number, r.marker, r.text])).toEqual([
      ["hunk", null, "", "@@ -10,3 +20,3 @@ fn"],
      ["context", 20, "", "ctx"],
      ["del", 11, "-", "old"],
      ["add", 21, "+", "new"],
      ["context", 22, "", "tail"],
    ]);
  });

  it("wraps diff text by default instead of scrolling sideways", () => {
    const screen = fs.readFileSync(path.join(__dirname, "../app/pr/[owner]/[repo]/[number].tsx"), "utf8");
    expect(screen).not.toMatch(/<ScrollView horizontal[^>]*>\s*<Text selectable[^>]*>\{file\.patchSnippet/);
    expect(screen).toContain("<DiffView patch={file.patchSnippet}/>");
    const view = fs.readFileSync(path.join(__dirname, "../src/components/DiffView.tsx"), "utf8");
    expect(view).toContain("useState(true)");
  });
});

describe("MM-048 sign-in guard", () => {
  it("treats signed-in screens as protected and leaves auth and public pages open", () => {
    expect(requiresSession(["(tabs)", "inbox"])).toBe(true);
    expect(requiresSession(["pr", "[owner]", "[repo]", "[number]"])).toBe(true);
    expect(requiresSession(["(auth)", "sign-in"])).toBe(false);
    expect(requiresSession(["(public)", "privacy"])).toBe(false);
    expect(requiresSession([])).toBe(false);
  });
});

describe("legal pages", () => {
  it("point to the official mergemate.dev pages instead of keeping their own copy", () => {
    for (const slug of ["terms", "privacy", "delete-account"]) {
      const screen = fs.readFileSync(path.join(__dirname, `../app/(public)/${slug}.tsx`), "utf8");
      expect(screen).toContain(`<LegalPage slug="${slug}"`);
      expect(screen).not.toMatch(/Wilmington|Orange St|SECTIONS/);
    }
    const legal = fs.readFileSync(path.join(__dirname, "../src/components/LegalPage.tsx"), "utf8");
    expect(legal).toContain('"https://mergemate.dev"');
  });
});
