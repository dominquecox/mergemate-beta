import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "..", file), "utf8");

describe("MM-137 Triage and Settings density", () => {
  const triage = read("app/(tabs)/triage.tsx");
  const settings = read("app/(tabs)/settings.tsx");

  it("makes the Triage workflow shortcut a compact desktop text action", () => {
    expect(triage).not.toContain('<Button title="Open agent workflows"');
    expect(triage).toMatch(/isDesktop && \(\s*<TouchableOpacity[\s\S]*accessibilityLabel="Open agent workflows"[\s\S]*minHeight: 44/);
  });

  it("keeps only Configure repos inline on narrow Settings", () => {
    expect(settings).toMatch(/Configure repos[\s\S]*\{isDesktop && \([\s\S]*Open agent workflows[\s\S]*Open unread alerts/);
    expect(settings).not.toMatch(/borderRadius: 8, backgroundColor: colors\.surfaceElevated, borderWidth: 1, borderColor: colors\.border, flexDirection: "row"/);
  });

  it("uses no weight 700 on these screens and keeps 44px targets", () => {
    expect(triage).not.toMatch(/fontWeight:\s*["']700["']/);
    expect(settings).not.toMatch(/fontWeight:\s*["']700["']/);
    expect(settings).toContain('accessibilityLabel="Configure watched repositories"');
  });
});
