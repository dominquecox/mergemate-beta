import { describe, expect, it } from "vitest";
import {
  AuthStartRequest,
  ErrorBody,
  HealthResponse,
  TelemetryEvent,
  Notification,
  NotificationPage,
  PrRef,
  PrRisk,
  PrSummary,
  Session,
  TriageQueue,
} from "../src/index";

const coverage = { analyzedFiles: 3, skippedFiles: 1, truncatedFiles: 0 };

describe("common", () => {
  it("accepts a valid error body and rejects unknown codes", () => {
    expect(
      ErrorBody.safeParse({ error: { code: "rate_limited", message: "Slow down", requestId: "r1" } })
        .success,
    ).toBe(true);
    expect(
      ErrorBody.safeParse({ error: { code: "teapot", message: "x", requestId: "r1" } }).success,
    ).toBe(false);
  });

  it("only accepts ok: true for health", () => {
    expect(HealthResponse.safeParse({ ok: true, version: "0.0.0" }).success).toBe(true);
    expect(HealthResponse.safeParse({ ok: false, version: "0.0.0" }).success).toBe(false);
  });

  it("validates PR references", () => {
    expect(PrRef.safeParse("octo/repo.js#12").success).toBe(true);
    expect(PrRef.safeParse("octo/repo#0").success).toBe(false);
    expect(PrRef.safeParse("octo#12").success).toBe(false);
  });
});

describe("auth", () => {
  it("parses a session and keeps demo optional", () => {
    expect(Session.safeParse({ token: "t", expiresAt: "2026-11-01T00:00:00Z" }).success).toBe(true);
    expect(
      Session.safeParse({ token: "t", expiresAt: "2026-11-01T00:00:00Z", demo: true }).success,
    ).toBe(true);
    expect(Session.safeParse({ token: "t", expiresAt: "tomorrow" }).success).toBe(false);
  });

  it("allows a web session with a CSRF token and no bearer token", () => {
    expect(Session.safeParse({ expiresAt: "2026-11-01T00:00:00Z", csrfToken: "c" }).success).toBe(true);
  });

  it("requires a 43-character S256 challenge and a platform", () => {
    const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
    expect(AuthStartRequest.safeParse({ codeChallenge: challenge, platform: "web" }).success).toBe(true);
    expect(AuthStartRequest.safeParse({ codeChallenge: challenge }).success).toBe(false);
    expect(AuthStartRequest.safeParse({ codeChallenge: "plain", platform: "ios" }).success).toBe(false);
  });
});

describe("github", () => {
  const item = {
    id: "n1",
    kind: "review",
    repo: "octo/repo",
    number: 12,
    title: "Add cache",
    author: "octocat",
    status: "open",
    updatedAt: "2026-10-26T12:00:00Z",
    read: false,
  };

  it("parses notifications with optional AI fields", () => {
    expect(Notification.safeParse(item).success).toBe(true);
    expect(Notification.safeParse({ ...item, risk: "high", summaryLine: "x" }).success).toBe(true);
    expect(Notification.safeParse({ ...item, risk: "severe" }).success).toBe(false);
  });

  it("parses a page with a null cursor", () => {
    expect(NotificationPage.safeParse({ items: [item], nextCursor: null }).success).toBe(true);
  });
});

describe("ai", () => {
  it("parses summary and risk with coverage", () => {
    expect(
      PrSummary.safeParse({
        whatChanged: "a",
        whyItMatters: "b",
        suggestedFocus: ["src/x.ts"],
        coverage,
      }).success,
    ).toBe(true);
    expect(PrRisk.safeParse({ level: "low", reasons: ["small"], coverage }).success).toBe(true);
    expect(PrRisk.safeParse({ level: "low", reasons: [], coverage }).success).toBe(false);
  });

  it("parses a triage queue", () => {
    expect(
      TriageQueue.safeParse([{ prRef: "octo/repo#1", lane: "needs_you", reason: "review requested" }])
        .success,
    ).toBe(true);
    expect(TriageQueue.safeParse([{ prRef: "octo/repo#1", lane: "later", reason: "" }]).success).toBe(
      false,
    );
  });
});

describe("telemetry", () => {
  it("accepts allowlisted events with small props only", () => {
    expect(TelemetryEvent.safeParse({ name: "pr_open", props: { source: "inbox" } }).success).toBe(true);
    expect(TelemetryEvent.safeParse({ name: "anything" }).success).toBe(false);
    expect(TelemetryEvent.safeParse({ name: "pr_open", props: { source: "x".repeat(65) } }).success).toBe(false);
    const many = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`k${"abcdefghi"[i]}`, 1]));
    expect(TelemetryEvent.safeParse({ name: "pr_open", props: many }).success).toBe(false);
  });
});
