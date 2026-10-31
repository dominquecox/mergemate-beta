import { describe, expect, it } from "vitest";
import { DEMO_HIGHLIGHT_SAMPLES } from "../src/highlight/demoSamples";

describe("Highlight demo samples", () => {
  it("has three samples with unique ids, an insight and areas", () => {
    expect(DEMO_HIGHLIGHT_SAMPLES).toHaveLength(3);
    expect(new Set(DEMO_HIGHLIGHT_SAMPLES.map((s) => s.id)).size).toBe(3);
    for (const s of DEMO_HIGHLIGHT_SAMPLES) {
      expect(s.insight.length).toBeGreaterThan(20);
      expect(s.areas.length).toBeGreaterThan(0);
    }
  });
  it("shows no real-looking secret", () => {
    const all = JSON.stringify(DEMO_HIGHLIGHT_SAMPLES);
    expect(all).not.toMatch(/sk_live_[A-Za-z0-9]{8,}|AKIA[A-Z0-9]{8,}|gh[pousr]_[A-Za-z0-9]{10,}/);
  });
});
