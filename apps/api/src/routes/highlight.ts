import {inspectImage,IMAGE_MAX_BYTES} from "../images/validate";
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

const MAX_NOTE_CHARS = 500;

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
    if(image.size>IMAGE_MAX_BYTES)throw new ApiError("payload_too_large","That image is too large.");
    if(note!==undefined && typeof note!=="string")throw new ApiError("validation_failed","Send one text note.");
    const bytes = new Uint8Array(await image.arrayBuffer());
    if (bytes.byteLength > IMAGE_MAX_BYTES) {
      throw new ApiError("payload_too_large", "That image is too large.");
    }
    inspectImage(bytes);
    const requestDeps = c.get("deps");
    const result = await analyzeHighlight({
      db: requireBinding(c.env, "DB"),
      transport: deps.transport ?? createFetchTransport(requestDeps.fetch),
      ai: deps.ai ?? c.env.AI,
      limits: actionLimits(c.env),
      env: c.env,
      session,
      image: bytes,
      note: typeof note === "string" ? note : "",
      requestId: c.get("requestId"),
      signal:c.req.raw.signal,
    });
    return c.json(result.body, 200, actionHeaders(result));
  });

  return router;
};
