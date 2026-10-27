import { describe, it, expect, beforeEach } from "vitest";
import { MockApiClient } from "../src/api/mock";

describe("MockApiClient", () => {
  let client: MockApiClient;

  beforeEach(() => {
    client = new MockApiClient();
  });

  it("returns healthy status", async () => {
    const health = await client.health();
    expect(health.ok).toBe(true);
    expect(health.version).toBeDefined();
  });

  it("starts a seeded demo session without live credentials (US-01)", async () => {
    const { session, user } = await client.startDemoSession();
    expect(session.demo).toBe(true);
    expect(session.token).toContain("demo");
    expect(user.login).toBe("demo-developer");
  });

  it("fetches CSRF token for web sessions", async () => {
    const csrf = await client.getCsrfToken();
    expect(csrf.csrfToken).toBeTruthy();
    expect(csrf.csrfToken.startsWith("mock_csrf_")).toBe(true);
  });

  it("filters notification inbox correctly (US-06, US-07)", async () => {
    const all = await client.getNotifications("all");
    expect(all.length).toBeGreaterThanOrEqual(4);

    const reviews = await client.getNotifications("review");
    expect(reviews.every((n) => n.kind === "review")).toBe(true);

    const mentions = await client.getNotifications("mentions");
    expect(mentions.every((n) => n.kind === "mention")).toBe(true);

    const mine = await client.getNotifications("mine");
    expect(mine.every((n) => n.kind === "mine")).toBe(true);
  });

  it("marks notifications as done and snoozes (US-08)", async () => {
    const initial = await client.getNotifications("all");
    const targetId = initial[0].id;

    await client.markNotificationDone(targetId);
    const updated = await client.getNotifications("all");
    expect(updated.find((n) => n.id === targetId)).toBeUndefined();
  });

  it("provides detailed AI summary and coverage (US-09)", async () => {
    const detail = await client.getPrDetail("dominquecox", "mergemate", 7);
    expect(detail.summary).toBeDefined();
    expect(detail.summary?.whatChanged).toBeTruthy();
    expect(detail.summary?.coverage.analyzedFiles).toBeGreaterThan(0);
    expect(detail.summary?.suggestedFocus.length).toBeGreaterThan(0);
  });

  it("flags secret leaks and elevates risk to High (US-10, US-25)", async () => {
    const detail = await client.getPrDetail("ploonu-llc", "typepress", 412);
    expect(detail.risk?.level).toBe("high");
    expect(detail.secretWarning).toBeDefined();
    expect(detail.secretWarning?.file).toBe("config/stripe.ts");
    expect(detail.secretWarning?.maskedSnippet).toContain("••••");
    // Ensure raw secret is NOT leaked in the warning
    expect(detail.secretWarning?.maskedSnippet).not.toContain("sk_live_123456789");
  });

  it("sorts and updates the triage deck queue (US-13)", async () => {
    const initialQueue = await client.getTriageQueue();
    expect(initialQueue.length).toBeGreaterThanOrEqual(4);

    const first = initialQueue[0];
    await client.setTriageChoice(first.prRef, "needs_you");

    const updatedQueue = await client.getTriageQueue();
    expect(updatedQueue.find((x) => x.prRef === first.prRef)).toBeUndefined();
  });

  it("tracks AI consent gating (US-05)", async () => {
    await client.setConsent(false);
    expect((await client.getConsent()).ai.granted).toBe(false);

    await client.setConsent(true);
    expect((await client.getConsent()).ai.granted).toBe(true);
  });

  it("returns billing plan and Stripe checkout session URL (US-19, US-20)", async () => {
    const plan = await client.getBillingPlan();
    expect(plan.plan).toBe("free");

    const checkout = await client.createCheckoutSession("pro_monthly");
    expect(checkout.url).toContain("checkout.stripe.com");

    const portal = await client.createPortalSession();
    expect(portal.url).toContain("billing.stripe.com");
  });

  it("analyzes screenshots and returns detected regions (US-15)", async () => {
    const res = await client.analyzeHighlight("file://test.jpg", "Test note");
    expect(res.insight).toContain("Meta AI");
    expect(res.regions.length).toBeGreaterThan(0);
  });
});
