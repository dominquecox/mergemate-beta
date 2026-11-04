import { describe, expect, it } from "vitest";
import { actionLimits, freePoolExhausted, fundingLimits, isFreePoolExhausted, triagePoolLimit, userDailyLimit, OWN_KEY_DAILY_LIMIT } from "../src/routes/ai-engine-gate";
import { isRulesFallback } from "../src/routes/ai-engine-risk";
import { ApiError } from "../src/errors";
import type { Env } from "../src/env";

describe("who pays for an AI action", () => {
  it("leaves the shared key and its budget as they were when the free pool is not configured (dev)", () => {
    const limits = actionLimits({ AI_GLOBAL_DAILY_ACTIONS: "300" } as Env);
    expect(limits.demo).toBeUndefined();
    expect(fundingLimits(false, limits)).toEqual(limits);
  });

  it("puts everyone without their own key on one shared free pool when it is configured", () => {
    const limits = actionLimits({ AI_DEMO_DAILY_ACTIONS: "40", AI_GLOBAL_DAILY_ACTIONS: "300" } as Env);
    expect(fundingLimits(false, limits)).toMatchObject({ global: 40, globalScope: "free_pool" });
  });

  it("never spends a shared budget, or applies a plan cap, for someone using their own key", () => {
    const limits = actionLimits({ AI_DEMO_DAILY_ACTIONS: "40", AI_GLOBAL_DAILY_ACTIONS: "300" } as Env);
    expect(fundingLimits(true, limits)).toMatchObject({ global: undefined, globalScope: undefined });
    expect(userDailyLimit(true, 5)).toBe(OWN_KEY_DAILY_LIMIT);
    expect(userDailyLimit(false, 5)).toBe(5);
  });

  it("caps one user's triage at a small share of the free pool, and leaves own-key triage alone", () => {
    const pooled = fundingLimits(false, actionLimits({ AI_DEMO_DAILY_ACTIONS: "40" } as Env));
    expect(triagePoolLimit(pooled, 10)).toBe(5);
    expect(triagePoolLimit(fundingLimits(false, actionLimits({ AI_DEMO_DAILY_ACTIONS: "3" } as Env)), 10)).toBe(1);
    expect(triagePoolLimit(fundingLimits(true, actionLimits({ AI_DEMO_DAILY_ACTIONS: "40" } as Env)), OWN_KEY_DAILY_LIMIT)).toBe(OWN_KEY_DAILY_LIMIT);
  });

  it("gives rule-based risk when the free pool is used up, but not for other refusals", () => {
    expect(isFreePoolExhausted(freePoolExhausted())).toBe(true);
    expect(isRulesFallback(freePoolExhausted())).toBe(true);
    expect(isRulesFallback(new ApiError("forbidden", "AI summaries and risk are turned off in Settings."))).toBe(false);
  });
});
