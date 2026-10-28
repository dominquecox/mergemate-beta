import { describe, expect, it } from "vitest";
import { readBoundedBody } from "../src/lib/bounded-body";
import { appFor } from "./sign-in";
import { testContext } from "./helpers";

const MiB = 1024 * 1024;
function streamed(headers: Record<string, string> = {}) {
  let produced = 0;
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) { produced++; controller.enqueue(new Uint8Array(MiB)); if (produced === 20) controller.close(); },
    cancel() { cancelled = true; },
  }, { highWaterMark: 0 });
  const request = new Request("https://example.test/v1/webhooks/github", { method: "POST", headers, body, duplex: "half" } as RequestInit);
  return { request, produced: () => produced, cancelled: () => cancelled };
}
describe("bounded raw webhook body", () => {
  for (const headers of [{}, { "content-length": "1" }, { "content-length": "invalid" }]) {
    it(`cancels oversized stream with ${JSON.stringify(headers)}`, async () => {
      const source = streamed(headers);
      await expect(readBoundedBody(source.request, 5 * MiB)).rejects.toMatchObject({ code: "payload_too_large" });
      expect(source.produced()).toBe(6);
      expect(source.cancelled()).toBe(true);
    });
  }
  it("rejects oversized declared length before reading", async () => {
    const source = streamed({ "content-length": String(20 * MiB) });
    await expect(readBoundedBody(source.request, 5 * MiB)).rejects.toMatchObject({ code: "payload_too_large" });
    expect(source.produced()).toBe(0); expect(source.cancelled()).toBe(true);
  });
  it("preserves exact bytes at the boundary and accepts empty input", async () => {
    const raw = new Uint8Array(5 * MiB); raw[0] = 255; raw[raw.length - 1] = 17;
    const result = await readBoundedBody(new Request("https://example.test", { method: "POST", body: raw }), raw.length);
    expect(Buffer.from(result).equals(Buffer.from(raw))).toBe(true);
    expect((await readBoundedBody(new Request("https://example.test"), 10)).byteLength).toBe(0);
  });
  it("rejects oversized unsigned route input before DB or queue work", async () => {
    const ctx = testContext(); const source = streamed();
    const response = await appFor(ctx)("/v1/webhooks/github", source.request);
    expect(response.status).toBe(413); expect(source.produced()).toBeLessThan(20);
    expect(source.cancelled()).toBe(true); expect(ctx.queued).toHaveLength(0);
    expect(ctx.db.rows("SELECT * FROM github_deliveries")).toHaveLength(0);
  });
});
