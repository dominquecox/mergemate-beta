import { ErrorBody } from "@mergemate/contracts";
import { describe, expect, it } from "vitest";
import { demoHeaders } from "./demo-session";
import { testContext } from "./helpers";
import { appFor, signIn } from "./sign-in";

const pngFile = (bytes: Uint8Array, name = "shot.png") => new File([bytes], name, { type: "image/png" });

const pngBytes = (): Uint8Array => {
  const header = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const bytes = new Uint8Array(64);
  bytes.set(header);
  return bytes;
};

const imageForm = (file: File, note?: string) => {
  const form = new FormData();
  form.append("image", file);
  if (note !== undefined) form.append("note", note);
  return form;
};

const grant = async (call: ReturnType<typeof appFor>, headers: Record<string, string>) => {
  const res = await call("/v1/consent", {
    method: "PUT",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ ai: { granted: true, version: "1" } }),
  });
  if (res.status !== 200) throw new Error(`consent grant failed: ${res.status}`);
};

describe("highlight route", () => {
  it("requires sign-in", async () => {
    const ctx = testContext();
    const res = await appFor(ctx)("/v1/highlight", { method: "POST", body: imageForm(pngFile(pngBytes())) });
    expect(res.status).toBe(401);
  });

  it("validates magic bytes, not the file name", async () => {
    const ctx = testContext();
    const call = appFor(ctx);
    const { headers } = await signIn(ctx, "ios");
    await grant(call, headers);
    const res = await call("/v1/highlight", {
      method: "POST",
      headers,
      body: imageForm(pngFile(new TextEncoder().encode("not an image at all"))),
    });
    expect(res.status).toBe(422);
  });

  it("rejects missing images and long notes", async () => {
    const ctx = testContext();
    const call = appFor(ctx);
    const { headers } = await signIn(ctx, "ios");
    await grant(call, headers);
    expect((await call("/v1/highlight", { method: "POST", headers, body: new FormData() })).status).toBe(
      422,
    );
    const longNote = await call("/v1/highlight", {
      method: "POST",
      headers,
      body: imageForm(pngFile(pngBytes()), "x".repeat(501)),
    });
    expect(longNote.status).toBe(422);
  });

  it("rejects oversized images", async () => {
    const ctx = testContext();
    const call = appFor(ctx);
    const { headers } = await signIn(ctx, "ios");
    await grant(call, headers);
    const res = await call("/v1/highlight", {
      method: "POST",
      headers,
      body: imageForm(pngFile(new Uint8Array(5 * 1024 * 1024 + 1), "big.png")),
    });
    expect(res.status).toBe(413);
  });

  it("keeps demo uploads out of highlight", async () => {
    const ctx = testContext();
    const call = appFor(ctx);
    const headers = await demoHeaders(ctx);
    const res = await call("/v1/highlight", {
      method: "POST",
      headers,
      body: imageForm(pngFile(pngBytes()), "checkout button"),
    });
    expect(res.status).toBe(403);
  });

  it("requires consent before analysis", async () => {
    const ctx = testContext();
    const call = appFor(ctx);
    const { headers } = await signIn(ctx, "ios");
    const denied = await call("/v1/highlight", {
      method: "POST",
      headers,
      body: imageForm(pngFile(pngBytes())),
    });
    expect(denied.status).toBe(403);
  });

  it("reports unavailable analysis without storing the upload", async () => {
    const ctx = testContext();
    const call = appFor(ctx);
    const { headers } = await signIn(ctx, "ios");
    await grant(call, headers);
    const res = await call("/v1/highlight", {
      method: "POST",
      headers,
      body: imageForm(pngFile(pngBytes()), "checkout button"),
    });
    expect(res.status).toBe(502);
    expect(ErrorBody.parse(await res.json()).error.code).toBe("upstream_unavailable");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
