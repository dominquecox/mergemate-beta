import { HighlightResult } from "@mergemate/contracts";
import { describe, expect, it } from "vitest";
import { parseSegmentBoxes } from "../src/routes/ai-engine-segment";
import { fixtureImages, imagePng } from "./image-fixtures";
import { fakeDataset, json, testContext as baseContext, validModelEnv } from "./helpers";
import type { RecordedCall } from "./helpers";
import { appFor, signIn } from "./sign-in";

const URL = "https://api.meta.ai/v1/responses";
const SAM_ONE = "0<|box;x1=100;y1=200;x2=300;y2=400;w=1000;h=2000|><|mask;abc|>";
const SAM_TWO = `${SAM_ONE},1<|box;x1=0;y1=0;x2=500;y2=1000;w=1000;h=2000|><|mask;def|>`;
const MUSE = JSON.stringify({ explanation: "Region 1 is the changed button.", regions: [{ xMin: 1, yMin: 1, xMax: 9, yMax: 9, label: "Muse guess" }] });

const reply = (text: string) => json({ object: "response", output: [{ type: "message", content: [{ type: "output_text", text }] }] });

const setup = (samText: string | (() => Response), extraEnv: Record<string, unknown> = {}) => {
  const ctx = baseContext({
    ...validModelEnv(),
    MODEL_ROUTE_HIGHLIGHT: "meta:muse-spark-1.3",
    MODEL_ROUTE_SEGMENT: "meta:sam-3.1",
    IMAGES: fixtureImages(),
    AI_METRICS: fakeDataset(),
    ...extraEnv,
  });
  ctx.kv.set("flags:v1", JSON.stringify({ highlight: true }));
  const order: string[] = [];
  const bodies: Record<string, unknown>[] = [];
  ctx.net.on("POST", URL, (call: RecordedCall) => {
    const body = JSON.parse(call.body ?? "{}") as Record<string, unknown>;
    bodies.push(body);
    order.push(String(body.model));
    if (body.model === "sam-3.1") return typeof samText === "function" ? samText() : reply(samText);
    return reply(MUSE);
  });
  return { ctx, order, bodies };
};

const run = async (ctx: ReturnType<typeof baseContext>) => {
  const call = appFor(ctx);
  const { headers } = await signIn(ctx, "ios");
  await call("/v1/consent", { method: "PUT", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ ai: { granted: true, version: "1" } }) });
  const form = new FormData();
  form.append("image", new File([imagePng()], "shot.png", { type: "image/png" }));
  form.append("note", "checkout button");
  return call("/v1/highlight", { method: "POST", headers, body: form });
};

describe("parseSegmentBoxes", () => {
  it("scales pixel boxes to 0-1000 and ignores masks", () => {
    expect(parseSegmentBoxes(SAM_TWO)).toEqual([
      { xMin: 100, yMin: 100, xMax: 300, yMax: 200, label: "Detected region 1" },
      { xMin: 0, yMin: 0, xMax: 500, yMax: 500, label: "Detected region 2" },
    ]);
  });
  it("returns nothing for empty text and drops degenerate or out-of-image boxes", () => {
    expect(parseSegmentBoxes("")).toEqual([]);
    expect(parseSegmentBoxes("0<|box;x1=5;y1=5;x2=5;y2=9;w=10;h=10|>")).toEqual([]);
    expect(parseSegmentBoxes("0<|box;x1=1;y1=1;x2=20;y2=9;w=10;h=10|>")).toEqual([]);
    expect(parseSegmentBoxes("0<|box;x1=1;y1=1;x2=2;y2=2;w=0;h=0|>")).toEqual([]);
  });
});

// UNVERIFIED: no live SAM 3.1 call has been made yet. These pin how the parser treats plausible variations of the
// documented token format, so the first real output either matches one of them or is a one-line fix here.
describe("parseSegmentBoxes on plausible live output (unverified shape)", () => {
  it("reads boxes separated by newlines or spaces, with surrounding prose", () => {
    const text = `Found 2 regions:\n0<|box;x1=100;y1=200;x2=300;y2=400;w=1000;h=2000|>\n1<|box;x1=0;y1=0;x2=500;y2=1000;w=1000;h=2000|> done`;
    expect(parseSegmentBoxes(text)).toHaveLength(2);
  });

  it("caps the number of boxes at MAX_SEGMENT_REGIONS", () => {
    const text = Array.from({ length: 30 }, (_, i) => `${i}<|box;x1=1;y1=1;x2=50;y2=50;w=100;h=100|>`).join("");
    expect(parseSegmentBoxes(text)).toHaveLength(20);
  });

  it("returns nothing for decimal coordinates rather than guessing, so Highlight falls back to Muse-only", () => {
    expect(parseSegmentBoxes("0<|box;x1=10.5;y1=20.5;x2=300.5;y2=400.5;w=1000;h=2000|>")).toEqual([]);
  });
});

describe("highlight with SAM then Muse", () => {
  it("calls SAM first, hands Muse the boxes, and returns the measured boxes", async () => {
    const { ctx, order, bodies } = setup(SAM_ONE);
    const res = await run(ctx);
    expect(res.status).toBe(200);
    expect(order).toEqual(["sam-3.1", "muse-spark-1.3"]);
    const body = HighlightResult.parse(await res.json());
    expect(body.insight).toBe("Region 1 is the changed button.");
    expect(body.regions).toEqual([{ xMin: 100, yMin: 100, xMax: 300, yMax: 200, label: "Detected region 1" }]);
    // SAM gets only the fixed prompt and the image; Muse gets the boxes in its prompt and the image.
    const sam = bodies[0] as { input: { content: { type: string; text?: string }[] }[]; instructions?: unknown; reasoning?: unknown };
    expect(sam.instructions).toBeUndefined();
    expect(sam.reasoning).toBeUndefined();
    expect(sam.input[0]?.content.map((p) => p.type)).toEqual(["input_text", "input_image"]);
    expect(sam.input[0]?.content[0]?.text).toBe("changed area");
    const muse = bodies[1] as { input: { content: { type: string; text?: string }[] }[]; instructions: string };
    expect(muse.input[0]?.content[0]?.text).toContain("1: x 100-300, y 100-200");
    expect(muse.input[0]?.content.map((p) => p.type)).toEqual(["input_text", "input_image"]);
    expect(muse.instructions).toContain("segmentation model has already marked");
  });

  it("meters both calls and logs no image bytes", async () => {
    const metrics = fakeDataset();
    const { ctx } = setup(SAM_ONE, { AI_METRICS: metrics });
    expect((await run(ctx)).status).toBe(200);
    expect(metrics.points.map((p) => p.blobs?.[0])).toEqual(["segment", "highlight"]);
    expect(JSON.stringify(metrics.points)).not.toContain("base64");
  });

  it("falls back to Muse with an honest empty result when SAM finds nothing", async () => {
    const { ctx, order, bodies } = setup("");
    const res = await run(ctx);
    expect(res.status).toBe(200);
    expect(order).toEqual(["sam-3.1", "muse-spark-1.3"]);
    expect(HighlightResult.parse(await res.json()).regions).toEqual([]);
    expect((bodies[1] as { instructions: string }).instructions).toContain("found no regions");
  });

  it("keeps the Muse-only highlight when SAM is down", async () => {
    const { ctx, order } = setup(() => new Response("down", { status: 503 }));
    const res = await run(ctx);
    expect(res.status).toBe(200);
    expect(order.filter((m) => m === "muse-spark-1.3")).toHaveLength(1);
    expect(HighlightResult.parse(await res.json()).regions).toEqual([{ xMin: 1, yMin: 1, xMax: 9, yMax: 9, label: "Muse guess" }]);
  });

  it("never calls SAM when MODEL_ROUTE_SEGMENT is unset", async () => {
    const { ctx, order } = setup(SAM_ONE, { MODEL_ROUTE_SEGMENT: undefined });
    expect((await run(ctx)).status).toBe(200);
    expect(order).toEqual(["muse-spark-1.3"]);
  });

  it("refuses a segment route that is not allowed, before any call", async () => {
    const { ctx, order } = setup(SAM_ONE, { MODEL_ROUTE_SEGMENT: "meta:muse-spark-1.3" });
    expect((await run(ctx)).status).toBe(500);
    expect(order).toEqual([]);
  });

  it("makes no model call without consent or with the highlight flag off", async () => {
    const { ctx, order } = setup(SAM_ONE);
    const call = appFor(ctx);
    const { headers } = await signIn(ctx, "ios");
    const form = new FormData();
    form.append("image", new File([imagePng()], "shot.png", { type: "image/png" }));
    expect((await call("/v1/highlight", { method: "POST", headers, body: form })).status).toBe(403);
    const off = setup(SAM_ONE);
    off.ctx.kv.set("flags:v1", JSON.stringify({ highlight: false }));
    expect((await run(off.ctx)).status).toBe(404);
    expect([...order, ...off.order]).toEqual([]);
  });
});
