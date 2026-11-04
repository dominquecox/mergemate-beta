import { ConsentState, ErrorBody } from "@mergemate/contracts";
import { describe, expect, it } from "vitest";
import { demoHeaders } from "./demo-session";
import { testContext } from "./helpers";
import { appFor, signIn } from "./sign-in";

const put = (body: unknown, headers: Record<string, string> = {}): RequestInit => ({
  method: "PUT",
  headers: { "content-type": "application/json", ...headers },
  body: JSON.stringify(body),
});

describe("consent routes", () => {
  it("requires sign-in", async () => {
    const ctx = testContext();
    const res = await appFor(ctx)("/v1/consent", {});
    expect(res.status).toBe(401);
    expect(ErrorBody.parse(await res.json()).error.code).toBe("unauthorized");
  });

  it("reports ungranted consent to demo sessions", async () => {
    const ctx = testContext();
    const res = await appFor(ctx)("/v1/consent", { headers: await demoHeaders(ctx) });
    expect(res.status).toBe(200);
    expect(ConsentState.parse(await res.json())).toEqual({ ai: { granted: false, version: "2", currentVersion: "2" } });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("refuses consent writes from demo sessions", async () => {
    const ctx = testContext();
    const res = await appFor(ctx)(
      "/v1/consent",
      put({ ai: { granted: true, version: "2" } }, await demoHeaders(ctx)),
    );
    expect(res.status).toBe(403);
    expect(ErrorBody.parse(await res.json()).error.code).toBe("forbidden");
  });

  it("records and reads back a grant for signed-in users", async () => {
    const ctx = testContext();
    const call = appFor(ctx);
    const { headers } = await signIn(ctx, "ios");
    const saved = await call("/v1/consent", put({ ai: { granted: true, version: "2" } }, headers));
    expect(saved.status).toBe(200);
    const state = ConsentState.parse(await saved.json());
    expect(state.ai.granted).toBe(true);
    expect(state.ai.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const get = await call("/v1/consent", { headers });
    expect(ConsentState.parse(await get.json()).ai.granted).toBe(true);
  });

  it("rejects invalid and stale consent versions", async () => {
    const ctx = testContext();
    const call = appFor(ctx);
    const { headers } = await signIn(ctx, "ios");
    expect((await call("/v1/consent", put({ ai: { granted: true } }, headers))).status).toBe(422);
    expect(
      (await call("/v1/consent", put({ ai: { granted: true, version: "0" } }, headers))).status,
    ).toBe(422);
  });
});
