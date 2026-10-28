import { Hono } from "hono";
import { readFeatureFlags } from "./flags";
import {
  actionHeaders,
  actionLimits,
  analyzeHighlight,
  createFetchTransport,
  noStore,
  userKey,
} from "./ai-engine";
import type { HighlightContentType } from "./ai-engine";
import type { AiBinding, AppEnv } from "../env";
import type { ModelTransport } from "../ai/provider";
import { requireBinding } from "../config";
import { ApiError } from "../errors";
import { createDbConsentStore, requireConsent } from "./consent";

export interface HighlightRouterDeps {
  transport?: ModelTransport;
  /** Workers AI binding override; defaults to the Worker's `AI` binding. */
  ai?: AiBinding;
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_NOTE_CHARS = 500;

/** Content type from the bytes themselves; the client's file name and type are ignored. */
const detectImageType = (bytes: Uint8Array): HighlightContentType | null => {
  const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (jpeg) return "image/jpeg";
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
  if (png) return "image/png";
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
  if (webp) return "image/webp";
  return null;
};

/**
 * Deletes every highlight upload for a user. Upload keys are scoped `<userId>/<random>`,
 * so one prefix lists exactly that user's uploads. Runs inside account deletion; a
 * missing bucket means there is nothing to purge.
 */
export const deleteUserUploads = async (env: AppEnv["Bindings"], userId: string): Promise<void> => {
  const uploads = env.HIGHLIGHT_UPLOADS;
  if (!uploads) return;
  const prefix = `${userId}/`;
  let cursor: string | undefined;
  for (;;) {
    const page = await uploads.list({ prefix, ...(cursor ? { cursor } : {}) });
    if (page.objects.length > 0) {
      await uploads.delete(page.objects.map((object) => object.key));
    }
    if (!page.truncated) return;
    cursor = page.cursor;
  }
};

export const createHighlightRouter = (deps: HighlightRouterDeps = {}) => {
  const router = new Hono<AppEnv>();
  router.use(noStore);

  router.post("/", async (c) => {
    if (!(await readFeatureFlags(c.env)).highlight) throw new ApiError("not_found", "Screenshot highlight is unavailable.");
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
    const bytes = new Uint8Array(await image.arrayBuffer());
    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      throw new ApiError("payload_too_large", "That image is too large.");
    }
    const contentType = detectImageType(bytes);
    if (!contentType) {
      throw new ApiError("validation_failed", "That image type is not supported.");
    }
    const requestDeps = c.get("deps");
    const result = await analyzeHighlight({
      db: requireBinding(c.env, "DB"),
      transport: deps.transport ?? createFetchTransport(requestDeps.fetch),
      ai: deps.ai ?? c.env.AI,
      limits: actionLimits(c.env),
      env: c.env,
      session,
      image: bytes,
      contentType,
      note: typeof note === "string" ? note : "",
      requestId: c.get("requestId"),
    });
    return c.json(result.body, 200, actionHeaders(result));
  });

  return router;
};
