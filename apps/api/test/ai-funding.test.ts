import { describe, expect, it } from "vitest";
import { actionLimits, fundingLimits, userDailyLimit, OWN_KEY_DAILY_LIMIT } from "../src/routes/ai-engine-gate";
import type { Env } from "../src/env";

describe("who pays for an AI action", () => {
  it("leaves the shared key and its budget as they were when the free pool is not configured (dev)", () => {
    const limits = actionLimits({ AI_GLOBAL_DAILY_ACTIONS: "300" } as Env);
    expect(limits.demo).toBeUndefined();
    expect(fundingLimits(false, limits)).toEqual(limits);
  });

  it("puts everyone without their own key on one shared free pool when it is configured", () => {
    const limits = actionLimits({ AI_DEMO_DAILY_ACTIONS: "40", AI_GLOBAL_DAILY_ACTIONS: "300" } as Env);
    expect(fundingLimits(false, limits)).toMatchObject({ global: 40, globalScope: "demo" });
  });

  it("never spends a shared budget, or applies a plan cap, for someone using their own key", () => {
    const limits = actionLimits({ AI_DEMO_DAILY_ACTIONS: "40", AI_GLOBAL_DAILY_ACTIONS: "300" } as Env);
    expect(fundingLimits(true, limits)).toMatchObject({ global: undefined, globalScope: undefined });
    expect(userDailyLimit(true, 5)).toBe(OWN_KEY_DAILY_LIMIT);
    expect(userDailyLimit(false, 5)).toBe(5);
  });
});
