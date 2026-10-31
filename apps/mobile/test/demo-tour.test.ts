import { describe, expect, it } from "vitest";
import { clampTourStep, DEMO_TOUR_PATH, DEMO_TOUR_STEPS } from "../src/workspace/tour";
import { seedPrDetails } from "../src/api/mock-data";

describe("demo tour", () => {
  it("has four steps and clamps out-of-range steps", () => {
    expect(DEMO_TOUR_STEPS).toHaveLength(4);
    expect(clampTourStep(-3)).toBe(0);
    expect(clampTourStep(99)).toBe(3);
    expect(clampTourStep(Number.NaN)).toBe(0);
  });
  it("opens on a sample PR that exists", () => {
    expect(DEMO_TOUR_PATH).toContain("ploonu-llc/typepress/412");
    expect(seedPrDetails()["ploonu-llc/typepress/412"]?.risk?.level).toBe("high");
  });
});
