import { describe, expect, it } from "vitest";
import { seedNotifications, seedPrDetails, seedTriageQueue } from "../src/api/mock-data";

describe("demo data", () => {
  it("has a real detail for every inbox item and no generic fallback", () => {
    const details = seedPrDetails();
    for (const n of seedNotifications()) {
      const d = details[`${n.repo}/${n.number}`];
      expect(d, `${n.repo}#${n.number}`).toBeDefined();
      expect(d.title).not.toMatch(/^Pull Request #/);
      expect(d.summary?.whatChanged.length).toBeGreaterThan(20);
      expect(d.risk?.level).toBe(n.risk);
    }
  });

  it("triages every inbox item exactly once", () => {
    const refs = seedTriageQueue().map((t) => t.prRef).sort();
    const want = seedNotifications().map((n) => `${n.repo}#${n.number}`).sort();
    expect(refs).toEqual(want);
  });
});
