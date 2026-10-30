import type { HighlightRegion } from "@mergemate/contracts";
import { recordAiCall } from "../ai/metrics";
import { createModelProvider } from "../ai/provider";
import type { ModelTransport } from "../ai/provider";
import { ConfigError } from "../errors";
import type { Env } from "../env";

/** Fixed prompt, never user input: SAM matches on wording, so the one that is tested ships. */
export const SEGMENT_PROMPT = "changed area";
export const SEGMENT_LABEL = "Detected region";
/** Boxes handed to Muse and returned to the app. Matches the HighlightResult region cap. */
export const MAX_SEGMENT_REGIONS = 20;

const BOX = /(\d+)<\|box;x1=(\d+);y1=(\d+);x2=(\d+);y2=(\d+);w=(\d+);h=(\d+)\|>/g;

/**
 * Parses SAM's `0<|box;x1=..;y1=..;x2=..;y2=..;w=..;h=..|>` tokens into 0 to 1000 boxes. Mask tokens are ignored.
 * A box with no area, outside its own image, or on a zero-size image is dropped. Empty output means no matches.
 */
export const parseSegmentBoxes = (text: string): HighlightRegion[] => {
  const regions: HighlightRegion[] = [];
  for (const match of text.matchAll(BOX)) {
    const [, , x1, y1, x2, y2, w, h] = match.map(Number) as [number, number, number, number, number, number, number, number];
    if (w <= 0 || h <= 0 || x2 <= x1 || y2 <= y1 || x2 > w || y2 > h) continue;
    regions.push({
      xMin: Math.round((x1 / w) * 1000),
      yMin: Math.round((y1 / h) * 1000),
      xMax: Math.round((x2 / w) * 1000),
      yMax: Math.round((y2 / h) * 1000),
      label: `${SEGMENT_LABEL} ${regions.length + 1}`,
    });
    if (regions.length >= MAX_SEGMENT_REGIONS) break;
  }
  // Rounding can collapse a sliver to zero width; those are not drawable boxes.
  return regions.filter((box) => box.xMax > box.xMin && box.yMax > box.yMin);
};

/** SAM is opt-in per deployment: no route var means the Highlight stays a single Muse call. */
export const segmentEnabled = (env: Env): boolean => Boolean(env.MODEL_ROUTE_SEGMENT?.trim());

/**
 * Step one of Highlight: SAM boxes the regions. Returns null when SAM failed or answered with something unusable,
 * so the caller falls back to a Muse-only highlight; returns [] when SAM ran and found nothing. Misconfiguration
 * still throws, since a bad route or rejected key is a setup problem, not an outage.
 */
export const segmentScreenshot = async (args: {
  env: Env;
  transport: ModelTransport;
  dataUrl: string;
  signal?: AbortSignal | undefined;
}): Promise<HighlightRegion[] | null> => {
  const { env, transport, dataUrl } = args;
  const provider = createModelProvider(env, "segment", { transport });
  const started = Date.now();
  const meter = (outcome: "ok" | "invalid_output" | "upstream_error", usage?: { inputTokens: number; outputTokens: number }) =>
    recordAiCall(env.AI_METRICS, {
      task: "segment",
      provider: provider.config.provider,
      modelId: provider.config.modelId,
      outcome,
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
      latencyMs: Date.now() - started,
    });
  try {
    const reply = await provider.complete({
      system: "",
      prompt: SEGMENT_PROMPT,
      maxOutputTokens: 1,
      image: { dataUrl },
      ...(args.signal ? { signal: args.signal } : {}),
    });
    const text = reply.text;
    const boxes = parseSegmentBoxes(text);
    // Text with box-like tokens but nothing parseable is an invalid answer, not an empty one.
    meter(boxes.length === 0 && text.includes("<|box") ? "invalid_output" : "ok", reply.usage);
    return boxes.length === 0 && text.includes("<|box") ? null : boxes;
  } catch (error) {
    if (error instanceof ConfigError) throw error;
    meter("upstream_error");
    return null;
  }
};
