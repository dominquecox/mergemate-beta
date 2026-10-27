import { Hono } from "hono";
import {
  VOICE_NOTE_MAX_BYTES,
  actionHeaders,
  actionLimits,
  detectVoiceAudioType,
  noStore,
  transcribeVoiceNote,
  userKey,
} from "./ai-engine";
import type { AppEnv } from "../env";
import { requireBinding } from "../config";
import { ApiError } from "../errors";
import { createDbConsentStore, requireConsent } from "./consent";
import { readFeatureFlags } from "./flags";

export const createVoiceNotesRouter = () => {
  const router = new Hono<AppEnv>();
  router.use(noStore);

  router.post("/", async (c) => {
    const session = c.get("session");
    // The flag is the feature switch: off means this endpoint does not exist for anyone.
    const flags = await readFeatureFlags(c.env);
    if (!flags.voice_notes) {
      throw new ApiError("not_found", "Voice notes are not available.");
    }
    await requireConsent(createDbConsentStore(requireBinding(c.env, "DB")), userKey(session));
    const form = await c.req.parseBody().catch(() => null);
    const audio = form?.["audio"];
    if (!(audio instanceof File)) {
      throw new ApiError("validation_failed", "Send one audio field with the recording.");
    }
    // The recording is held in memory only and never stored.
    const bytes = new Uint8Array(await audio.arrayBuffer());
    if (bytes.byteLength > VOICE_NOTE_MAX_BYTES) {
      throw new ApiError("payload_too_large", "That recording is too large.");
    }
    const audioType = detectVoiceAudioType(bytes);
    if (!audioType) {
      throw new ApiError("validation_failed", "That audio type is not supported.");
    }
    const requestDeps = c.get("deps");
    const result = await transcribeVoiceNote({
      db: requireBinding(c.env, "DB"),
      fetchImpl: requestDeps.fetch,
      limits: actionLimits(c.env),
      env: c.env,
      session,
      audio: bytes,
      audioType,
      requestId: c.get("requestId"),
    });
    return c.json(result.body, 200, actionHeaders(result));
  });

  return router;
};
