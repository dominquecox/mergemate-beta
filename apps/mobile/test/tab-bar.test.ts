import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "..", file), "utf8");

describe("bottom tab bar", () => {
  const layout = read("app/(tabs)/_layout.tsx");

  it("adds a Workflows tab after Triage that opens the shared Workflows screen", () => {
    expect(layout).toMatch(/item\.name === "triage"[\s\S]*name="workflows-tab"[\s\S]*title: "Workflows"/);
    expect(layout).toMatch(/tabPress: \(event\) => \{\s*event\.preventDefault\(\);\s*router\.push\("\/workflows"\);/);
    expect(read("app/(tabs)/workflows-tab.tsx")).toContain('<Redirect href="/workflows" />');
  });

  it("keeps labels clear of the iPhone home indicator with 44px tab targets", () => {
    expect(layout).toContain("const bottomInset = insets.bottom;");
    expect(layout).not.toMatch(/Platform\.OS === "web" \? 0 : insets\.bottom/);
    expect(layout).toContain("tabBarItemStyle: { minHeight: 44 }");
    expect(read("public/index.html")).toContain("viewport-fit=cover");
  });

  it("uses one name, Workflows, for the entry points", () => {
    expect(read("src/components/InboxOverview.tsx")).toContain('label: "Workflows"');
    expect(read("src/components/Sidebar.tsx")).toContain('accessibilityLabel="Workflows"');
  });
});
