import { describe, expect, it } from "vitest";
import { controlDensity } from "../src/theme";

describe("shared compact control density", () => {
  it("keeps compact visuals inside 44px interaction targets", () => {
    expect(controlDensity.desktop.primary.visualHeight).toBe(40);
    expect(controlDensity.desktop.secondary.visualHeight).toBe(32);
    expect(controlDensity.desktop.icon.visualHeight).toBe(32);
    expect(controlDensity.desktop.chip.visualHeight).toBe(28);
    expect(controlDensity.narrow.primary.visualHeight).toBe(44);
    expect(controlDensity.narrow.secondary.visualHeight).toBe(36);
    expect(controlDensity.narrow.icon.visualHeight).toBe(36);
    expect(controlDensity.narrow.chip.visualHeight).toBe(32);

    for (const viewport of [controlDensity.desktop, controlDensity.narrow]) {
      expect(viewport.primary.hitHeight).toBeGreaterThanOrEqual(44);
      expect(viewport.secondary.hitHeight).toBeGreaterThanOrEqual(44);
      expect(viewport.icon.hitHeight).toBeGreaterThanOrEqual(44);
      expect(viewport.chip.hitHeight).toBeGreaterThanOrEqual(44);
      expect(viewport.input.hitHeight).toBeGreaterThanOrEqual(44);
    }
  });
});

describe("CompactControl hit area", () => {
  it("gives every variant a 44px minimum width and height", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const source = readFileSync(join(__dirname, "..", "src", "components", "CompactControl.tsx"), "utf8");
    expect(source).toContain("minHeight: metric.hitHeight,");
    expect(source).toContain("minWidth: metric.hitHeight,");
  });
});
