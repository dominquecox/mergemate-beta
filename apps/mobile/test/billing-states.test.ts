import { describe, expect, it } from "vitest";
import { BILLING_CONFIG, billingAttention, billingStatusLabel, canStartCheckout, checkoutOutcome } from "../src/config/billing";
import { mapBillingPlan } from "../src/api/mappers";

describe("plan status wording", () => {
  it.each([
    ["none", "Free"],
    ["trialing", "Trial"],
    ["active", "Active"],
    ["past_due", "Payment due"],
    ["unpaid", "Unpaid"],
    ["canceled", "Canceled"],
    ["incomplete", "Payment pending"],
    ["something_new", "Updating"],
  ])("%s reads as %s", (status, label) => {
    expect(billingStatusLabel(status)).toBe(label);
  });

  it("asks for action only when a payment needs it", () => {
    expect(billingAttention("past_due")).toContain("Update your payment method");
    expect(billingAttention("unpaid")).toContain("Update your payment method");
    expect(billingAttention("active")).toBeNull();
    expect(billingAttention("canceled")).toBeNull();
  });

  it("keeps the trial out of the price text, so it is shown only to people who get it", () => {
    expect(BILLING_CONFIG.pro.monthly.billingText).not.toMatch(/trial/i);
    expect(BILLING_CONFIG.pro.annual.billingText).not.toMatch(/trial/i);
  });
});

describe("checkout success", () => {
  it("claims an upgrade only when the server's plan says Pro", () => {
    expect(checkoutOutcome({ plan: "free", status: "none" })).toBe("pending");
    expect(checkoutOutcome({ plan: "free", status: "incomplete" })).toBe("pending");
    expect(checkoutOutcome({ plan: "pro", status: "trialing" })).toBe("trial");
    expect(checkoutOutcome({ plan: "pro", status: "active" })).toBe("pro");
  });
});

describe("plan mapping", () => {
  it("carries trial eligibility and portal access from the API", () => {
    expect(mapBillingPlan({ plan: "free", status: "canceled", renewsAt: null, cancelAt: null, trialEligible: false, canManage: true }))
      .toEqual({ plan: "free", status: "canceled", trialEligible: false, canManage: true });
  });
});

describe("upgrade offer", () => {
  it("is shown only when there is no live subscription to manage instead", () => {
    for (const status of ["none", "canceled", "incomplete_expired"]) expect(canStartCheckout(status)).toBe(true);
    for (const status of ["past_due", "unpaid", "incomplete", "active", "trialing", "paused"]) expect(canStartCheckout(status)).toBe(false);
  });
});
