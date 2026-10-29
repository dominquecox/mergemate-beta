import {claimDeletion} from "../src/lib/account-deletion";
import { ErrorBody, HighlightResult } from "@mergemate/contracts";
import { describe, expect, it, vi } from "vitest";
import { storesFor } from "../src/routes/ai-engine";
import { demoHeaders } from "./demo-session";
import { fakeAi, fakeDataset, testContext as baseContext, validModelEnv } from "./helpers";
import { appFor, signIn } from "./sign-in";

// Explicitly opt in for the feature-on cases; missing flags stay off elsewhere.
const testContext: typeof baseContext = (...args) => { const ctx=baseContext(...args);ctx.kv.set('flags:v1',JSON.stringify({highlight:true}));return ctx; };

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

interface StoredUpload {
  value: Uint8Array;
  contentType: string | undefined;
}

interface FakeUploads {
  store: Map<string, StoredUpload>;
  puts: { key: string; value: Uint8Array; contentType: string | undefined }[];
  deletes: string[][];
}

const fakeR2 = () => {
  const fake: FakeUploads = { store: new Map(), puts: [], deletes: [] };
  const bucket = {
    async put(key: string, value: Uint8Array, options?: { httpMetadata?: { contentType?: string } }) {
      const contentType = options?.httpMetadata?.contentType;
      fake.store.set(key, { value, contentType });
      fake.puts.push({ key, value, contentType });
    },
    async get() {
      return null;
    },
    async delete(keys: string | string[]) {
      const list = Array.isArray(keys) ? keys : [keys];
      fake.deletes.push(list);
      for (const key of list) fake.store.delete(key);
    },
    async list(options?: { prefix?: string }) {
      const prefix = options?.prefix ?? "";
      const objects = [...fake.store.keys()]
        .filter((key) => key.startsWith(prefix))
        .map((key) => ({ key }));
      return { objects, truncated: false, cursor: undefined, delimitedPrefixes: [] };
    },
  };
  return { bucket: bucket as unknown as R2Bucket, fake };
};

const fakeImages = (output: Uint8Array, seen: { transform?: unknown; format?: unknown }) =>
  ({
    input: () => ({
      transform: (options: unknown) => {
        seen.transform = options;
        return {
          output: async (out: { format: unknown }) => {
            seen.format = out.format;
            return {
              response: () => new Response(output),
              contentType: () => "image/png",
              image: () => new Blob([output]).stream(),
            };
          },
        };
      },
    }),
  }) as unknown as ImagesBinding;

const ANSWER = JSON.stringify({
  explanation: "The checkout button stands out.",
  regions: [{ xMin: 10, yMin: 20, xMax: 200, yMax: 80, label: "Checkout button" }],
});

describe("highlight analysis", () => {
  it("deletes an upload even if storage accepts it but its put response fails",async()=>{
    const {bucket,fake}=fakeR2();const ai=fakeAi();const ctx=testContext({...validModelEnv(),AI:ai,HIGHLIGHT_UPLOADS:bucket});const {headers}=await signIn(ctx);const call=appFor(ctx);await grant(call,headers);
    const put=bucket.put.bind(bucket);vi.spyOn(bucket,'put').mockImplementation(async(key,value,options)=>{await put(key,value,options);throw new Error('Ambiguous storage response');});
    expect((await call('/v1/highlight',{method:'POST',headers,body:imageForm(pngFile(pngBytes()))})).status).toBe(500);expect(fake.store.size).toBe(0);expect(fake.deletes).toHaveLength(1);expect(ai.runs).toHaveLength(0);
  });
  it("cleans a late upload and refuses model work after account deletion starts",async()=>{
    const {bucket,fake}=fakeR2();const ai=fakeAi();const ctx=testContext({...validModelEnv(),AI:ai,HIGHLIGHT_UPLOADS:bucket});const {headers,userId}=await signIn(ctx);const call=appFor(ctx);await grant(call,headers);
    const put=bucket.put.bind(bucket);vi.spyOn(bucket,'put').mockImplementation(async(key,value,options)=>{const uploaded=await put(key,value,options);await claimDeletion(ctx.env.DB,userId,ctx.time.now());return uploaded;});
    expect((await call('/v1/highlight',{method:'POST',headers,body:imageForm(pngFile(pngBytes()))})).status).toBe(403);expect(fake.store.size).toBe(0);expect(fake.deletes).toHaveLength(1);expect(ai.runs).toHaveLength(0);
  });

  it("analyzes a real upload under a user-scoped random key, then deletes it", async () => {
    const { bucket, fake } = fakeR2();
    const ai = fakeAi(async () => ({ response: ANSWER, usage: { prompt_tokens: 10, completion_tokens: 5 } }));
    const metrics = fakeDataset();
    const ctx = testContext({
      ...validModelEnv(),
      AI: ai,
      AI_METRICS: metrics,
      HIGHLIGHT_UPLOADS: bucket,
    });
    const call = appFor(ctx);
    const { headers, userId } = await signIn(ctx, "ios");
    await grant(call, headers);
    const res = await call("/v1/highlight", {
      method: "POST",
      headers,
      body: imageForm(pngFile(pngBytes()), "checkout button"),
    });
    expect(res.status).toBe(200);
    const body = HighlightResult.parse(await res.json());
    expect(body.insight).toBe("The checkout button stands out.");
    expect(body.regions).toHaveLength(1);
    expect(body.requestId).toBe(res.headers.get("x-request-id"));
    expect(res.headers.get("x-actions-limit")).toBe("30");
    expect(res.headers.get("x-actions-remaining")).toBe("29");
    expect(fake.store.size).toBe(0);
    expect(fake.puts).toHaveLength(1);
    expect(fake.puts[0]?.key.startsWith(`${userId}/`)).toBe(true);
    expect(fake.puts[0]?.key).toMatch(/\/[0-9a-f-]{36}$/);
    expect(fake.puts[0]?.contentType).toBe("image/png");
    expect(fake.deletes).toEqual([[fake.puts[0]?.key]]);

    expect(ai.runs).toHaveLength(1);
    const inputs = ai.runs[0]?.inputs as { messages: { role: string; content: unknown }[] };
    expect(inputs.messages[0]).toEqual({ role: "system", content: expect.any(String) });
    const parts = inputs.messages[1]?.content as { type: string; image_url?: { url: string } }[];
    expect(parts[0]?.type).toBe("text");
    expect(parts[1]?.type).toBe("image_url");
    expect(parts[1]?.image_url?.url.startsWith("data:image/png;base64,")).toBe(true);

    expect(metrics.points).toHaveLength(1);
    expect(metrics.points[0]?.blobs?.[0]).toBe("highlight");
  });

  it("releases the reservation and deletes the upload when analysis fails", async () => {
    const { bucket, fake } = fakeR2();
    const ctx = testContext({
      ...validModelEnv(),
      AI: fakeAi(async () => {
        throw new Error("model down");
      }),
      HIGHLIGHT_UPLOADS: bucket,
    });
    const call = appFor(ctx);
    const { headers, userId } = await signIn(ctx, "ios");
    await grant(call, headers);
    const res = await call("/v1/highlight", {
      method: "POST",
      headers,
      body: imageForm(pngFile(pngBytes())),
    });
    expect(res.status).toBe(502);
    expect(fake.store.size).toBe(0);
    expect(fake.puts).toHaveLength(1);
    expect(fake.deletes).toHaveLength(1);
    const check = await storesFor(ctx.db as unknown as D1Database).usage.check(userId, 30);
    expect(check.remaining).toBe(30);
  });

  it("deletes the upload when the answer is unusable", async () => {
    const { bucket, fake } = fakeR2();
    const ctx = testContext({
      ...validModelEnv(),
      AI: fakeAi(async () => ({ response: "not json at all" })),
      HIGHLIGHT_UPLOADS: bucket,
    });
    const call = appFor(ctx);
    const { headers } = await signIn(ctx, "ios");
    await grant(call, headers);
    const res = await call("/v1/highlight", {
      method: "POST",
      headers,
      body: imageForm(pngFile(pngBytes())),
    });
    expect(res.status).toBe(502);
    expect(fake.store.size).toBe(0);
    expect(fake.deletes).toHaveLength(1);
  });

  it("resizes uploads through Image Transformations when configured", async () => {
    const { bucket, fake } = fakeR2();
    const transformed = new Uint8Array([9, 9, 9]);
    const seen: { transform?: unknown; format?: unknown } = {};
    const ai = fakeAi(async () => ({ response: ANSWER }));
    const ctx = testContext({
      ...validModelEnv(),
      AI: ai,
      HIGHLIGHT_UPLOADS: bucket,
      IMAGES: fakeImages(transformed, seen),
    });
    const call = appFor(ctx);
    const { headers } = await signIn(ctx, "ios");
    await grant(call, headers);
    const res = await call("/v1/highlight", {
      method: "POST",
      headers,
      body: imageForm(pngFile(pngBytes())),
    });
    expect(res.status).toBe(200);
    expect(seen.transform).toEqual({ width: 2048, height: 2048, fit: "scale-down" });
    expect(seen.format).toBe("image/png");
    expect(fake.puts).toHaveLength(1);
    expect(fake.puts[0]?.value).toEqual(transformed);
    expect(fake.store.size).toBe(0);
    expect(ai.runs).toHaveLength(1);
    const inputs = ai.runs[0]?.inputs as { messages: { role: string; content: unknown }[] };
    const parts = inputs.messages[1]?.content as { type: string; image_url?: { url: string } }[];
    const expected = `data:image/png;base64,${Buffer.from(transformed).toString("base64")}`;
    expect(parts[1]?.image_url?.url).toBe(expected);
  });

  it("purges uploads on account deletion", async () => {
    const { bucket, fake } = fakeR2();
    const ctx = testContext({ HIGHLIGHT_UPLOADS: bucket });
    ctx.net.on("DELETE", "https://api.github.com/applications/", () => new Response(null, { status: 204 }));
    const call = appFor(ctx);
    const { headers, userId } = await signIn(ctx, "ios");
    await bucket.put(`${userId}/a`, pngBytes());
    await bucket.put("other/b", pngBytes());
    const res = await call("/v1/account", { method: "DELETE", headers });
    expect(res.status).toBe(204);
    expect([...fake.store.keys()]).toEqual(["other/b"]);
  });
});
