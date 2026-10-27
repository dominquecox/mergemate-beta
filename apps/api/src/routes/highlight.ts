import { HighlightResult } from "@mergemate/contracts";
import { Hono } from "hono";
import { requireBinding } from "../config";
import { analyzeHighlight, noStore, userKey } from "./ai-engine";
import type { AppEnv } from "../env";
import { ApiError } from "../errors";
import { createDbConsentStore, requireConsent } from "./consent";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_NOTE_CHARS = 500;

const isSupportedImage = (bytes: Uint8Array): boolean => {
  const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png =
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;
  const webp =
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50;
  return jpeg || png || webp;
};

export const createHighlightRouter = () => {
  const router = new Hono<AppEnv>();
  router.use(noStore);

  router.post("/", async (c) => {
    const session = c.get("session");
    await requireConsent(createDbConsentStore(requireBinding(c.env, "DB")), userKey(session));
    const form = await c.req.parseBody().catch(() => null);
    const image = form?.["image"];
    const note = form?.["note"];
    if (!(image instanceof File)) {
      throw new ApiError("validation_failed", "Send one image field with the screenshot.");
    }
    if (typeof note === "string" && note.length > MAX_NOTE_CHARS) {
      throw new ApiError("validation_failed", "That note is too long.");
    }
    // The upload is held in memory only and never stored.
    const bytes = new Uint8Array(await image.arrayBuffer());
    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      throw new ApiError("payload_too_large", "That image is too large.");
    }
    if (!isSupportedImage(bytes)) {
      throw new ApiError("validation_failed", "That image type is not supported.");
    }
    const insight = await analyzeHighlight();
    return c.json(HighlightResult.parse({ insight, requestId: c.get("requestId") }));
  });

  return router;
};
