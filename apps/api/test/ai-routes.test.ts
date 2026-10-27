import { ErrorBody, PrRisk, PrSummary } from "@mergemate/contracts";
import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { FIXTURE_RISK, FIXTURE_SUMMARY } from "../src/routes/ai-engine";
import { createAiRouter } from "../src/routes/ai";
import type { AppEnv } from "../src/env";
import type { SessionRecord } from "../src/lib/sessions";
import { demoHeaders } from "./demo-session";
import { testContext } from "./helpers";
import { appFor, signIn } from "./sign-in";

const put = (body: unknown, headers: Record<string, string> = {}): RequestInit => ({
  method: "PUT",
  headers: { "content-type": "application/json", ...headers },
  body: JSON.stringify(body),
});

describe("AI summary and risk routes", () => {
  it("requires sign-in", async () => {
    const ctx = testContext();
    expect((await appFor(ctx)("/v1/prs/octo/demo/7/summary", { method: "POST" })).status).toBe(401);
  });

  it("rejects malformed references before anything else", async () => {
    const ctx = testContext();
    const call = appFor(ctx);
    const { headers } = await signIn(ctx, "ios");
    const res = await call("/v1/prs/octo/demo/last/summary", { method: "POST", headers });
    expect(res.status).toBe(422);
    expect(ErrorBody.parse(await res.json()).error.code).toBe("validation_failed");
  });

  it("requires consent before any AI route", async () => {
    const ctx = testContext();
    const call = appFor(ctx);
    const { headers } = await signIn(ctx, "ios");
    const res = await call("/v1/prs/octo/demo/7/summary", { method: "POST", headers });
    expect(res.status).toBe(403);
    expect(ErrorBody.parse(await res.json()).error.code).toBe("consent_required");
  });

  it("reports unavailable PR data after consent without touching the model", async () => {
    const ctx = testContext();
    const call = appFor(ctx);
    const { headers } = await signIn(ctx, "ios");
    await call("/v1/consent", put({ ai: { granted: true, version: "1" } }, headers));
    const res = await call("/v1/prs/octo/demo/7/summary", { method: "POST", headers });
    expect(res.status).toBe(502);
    expect(ErrorBody.parse(await res.json()).error.code).toBe("upstream_unavailable");
    expect(res.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("issues demo tokens the session middleware accepts", async () => {
    const ctx = testContext();
    const headers = await demoHeaders(ctx);
    expect(headers.Authorization).toMatch(/^Bearer [A-Za-z0-9_-]{20,128}$/);
  });

  it("serves fixture summaries and risk to demo sessions without model calls", async () => {
    const ctx = testContext();
    const call = appFor(ctx);
    const headers = await demoHeaders(ctx);
    const summary = await call("/v1/prs/octo/demo/7/summary", { method: "POST", headers });
    expect(summary.status).toBe(200);
    expect(PrSummary.parse(await summary.json())).toEqual(FIXTURE_SUMMARY);
    expect(summary.headers.get("x-actions-limit")).toBe("30");
    expect(summary.headers.get("x-actions-remaining")).toBe("30");
    const risk = await call("/v1/prs/octo/demo/7/risk", { method: "POST", headers });
    expect(risk.status).toBe(200);
    expect(PrRisk.parse(await risk.json())).toEqual(FIXTURE_RISK);
    expect(ctx.net.calls).toEqual([]);
  });

  it("returns fixtures before touching provider, source, consent or usage", async () => {
    const demo: SessionRecord = {
      tokenHash: "t",
      userId: null,
      demo: true,
      transport: "bearer",
      csrfToken: null,
      expiresAt: "2026-11-26T12:00:00.000Z",
      userStatus: "active",
    };
    const reached: string[] = [];
    const app = new Hono<AppEnv>();
    app.use(async (c, next) => {
      c.set("session", demo);
      await next();
    });
    app.route(
      "/v1/prs",
      createAiRouter({
        transport: {
          complete: () => {
            reached.push("provider");
            throw new Error("must not be reached");
          },
        },
        prSource: async () => {
          reached.push("source");
          throw new Error("must not be reached");
        },
      }),
    );
    for (const kind of ["summary", "risk"]) {
      const res = await app.request(`/v1/prs/octo/demo/7/${kind}`, { method: "POST" }, {});
      expect(res.status).toBe(200);
    }
    expect(reached).toEqual([]);
  });

  it("keeps demo fixtures shape-valid", () => {
    expect(PrSummary.parse(FIXTURE_SUMMARY)).toEqual(FIXTURE_SUMMARY);
    expect(PrRisk.parse(FIXTURE_RISK)).toEqual(FIXTURE_RISK);
  });
});
