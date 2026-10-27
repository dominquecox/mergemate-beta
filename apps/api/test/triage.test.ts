import { TriageQueue, TriageRecord } from "@mergemate/contracts";
import { describe, expect, it } from "vitest";
import { demoHeaders } from "./demo-session";
import { testContext } from "./helpers";
import { appFor, post, signIn } from "./sign-in";

const encoded = encodeURIComponent("octo/demo#1");

describe("triage routes", () => {
  it("requires sign-in", async () => {
    const ctx = testContext();
    expect((await appFor(ctx)("/v1/triage", {})).status).toBe(401);
  });

  it("serves the fixture queue to demo sessions", async () => {
    const ctx = testContext();
    const res = await appFor(ctx)("/v1/triage", { headers: await demoHeaders(ctx) });
    expect(res.status).toBe(200);
    expect(TriageQueue.parse(await res.json()).length).toBeGreaterThan(0);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("serves an empty queue without a data layer", async () => {
    const ctx = testContext();
    const call = appFor(ctx);
    const { headers } = await signIn(ctx, "ios");
    const res = await call("/v1/triage", { headers });
    expect(res.status).toBe(200);
    expect(TriageQueue.parse(await res.json())).toEqual([]);
  });

  it("rejects demo choice writes", async () => {
    const ctx = testContext();
    const res = await appFor(ctx)(
      `/v1/triage/${encoded}`,
      post({ lane: "fyi" }, await demoHeaders(ctx)),
    );
    expect(res.status).toBe(403);
  });

  it("records a choice and echoes it back", async () => {
    const ctx = testContext();
    const call = appFor(ctx);
    const { headers } = await signIn(ctx, "ios");
    const res = await call(`/v1/triage/${encoded}`, post({ lane: "ignore" }, headers));
    expect(res.status).toBe(200);
    expect(TriageRecord.parse(await res.json())).toEqual({ prRef: "octo/demo#1", lane: "ignore" });
  });

  it("rejects bad references and lanes", async () => {
    const ctx = testContext();
    const call = appFor(ctx);
    const { headers } = await signIn(ctx, "ios");
    expect((await call("/v1/triage/nonsense", post({ lane: "fyi" }, headers))).status).toBe(422);
    expect((await call(`/v1/triage/${encoded}`, post({ lane: "later" }, headers))).status).toBe(422);
  });
});
