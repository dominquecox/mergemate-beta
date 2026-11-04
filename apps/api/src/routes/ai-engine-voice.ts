import { savedMetaKey } from "../lib/user-meta-key";
import { requireBinding } from "../config";
import { captureAiPolicy } from "../lib/ai-policy";
import { VoiceNoteResult } from "@mergemate/contracts";
import { transcribeWithMeta, withUserOwnedKey } from "../ai/provider";
import type { SessionRecord } from "../lib/sessions";
import { getBillingPlan } from "../lib/stripe-billing";
import { requireConsent } from "./consent";
import type { Env } from "../env";
import { ApiError } from "../errors";
import { AiActionLimits, AiStores, FREE_POOL_MESSAGE, GLOBAL_LIMIT_MESSAGE, USER_LIMIT_MESSAGE, fundingLimits, limitError, storesFor, userDailyLimit, userKey, withReservation } from "./ai-engine-gate";

export const VOICE_NOTE_MAX_BYTES = 5 * 1024 * 1024;
export const VOICE_NOTE_MAX_SECONDS = 120;

/** Audio containers accepted by magic bytes. Only WAV carries verifiable duration. */
export type VoiceAudioType = "m4a" | "aac" | "wav" | "webm";

export const VOICE_CONTENT_TYPES: Record<VoiceAudioType, { contentType: string; extension: string }> = {
  m4a: { contentType: "audio/mp4", extension: "m4a" },
  aac: { contentType: "audio/aac", extension: "aac" },
  wav: { contentType: "audio/wav", extension: "wav" },
  webm: { contentType: "audio/webm", extension: "webm" },
};

/** Content type from the bytes themselves; the client's file name and type are ignored. */
export const detectVoiceAudioType = (bytes: Uint8Array): VoiceAudioType | null => {
  const ascii = (at: number, word: string): boolean =>
    bytes.length >= at + word.length &&
    word.split("").every((char, index) => (bytes[at + index] ?? 0) === char.charCodeAt(0));
  if (bytes.length >= 8 && ascii(4, "ftyp")) return "m4a";
  if (bytes.length >= 2 && (bytes[0] ?? 0) === 0xff && ((bytes[1] ?? 0) & 0xf0) === 0xf0) return "aac";
  if (ascii(0, "ADIF")) return "aac";
  if (bytes.length >= 12 && ascii(0, "RIFF") && ascii(8, "WAVE")) return "wav";
  if (
    bytes.length >= 4 &&
    (bytes[0] ?? 0) === 0x1a &&
    (bytes[1] ?? 0) === 0x45 &&
    (bytes[2] ?? 0) === 0xdf &&
    (bytes[3] ?? 0) === 0xa3
  ) {
    return "webm";
  }
  return null;
};

export interface WavInfo {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  durationSeconds: number;
}

/**
 * Reads the WAV header: format, sample rate and duration from the data chunk size.
 * Null means not a parseable WAV. Only mono 16-bit PCM at 16 or 24 kHz is sent upstream.
 */
export const readWavInfo = (bytes: Uint8Array): WavInfo | null => {
  try {
    if (detectVoiceAudioType(bytes) !== "wav" || bytes.length < 44) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if(view.getUint32(4,true)+8!==bytes.length)return null;
    let offset = 12;
    let pcm = false;
    let info: Omit<WavInfo, "durationSeconds"> | null = null;
    let dataSize: number | null = null;
    while (offset + 8 <= bytes.length) {
      const id = String.fromCharCode(bytes[offset] ?? 0, bytes[offset + 1] ?? 0, bytes[offset + 2] ?? 0, bytes[offset + 3] ?? 0);
      const size = view.getUint32(offset + 4, true);
      if(offset+8+size>bytes.length)return null;
      if (id === "fmt " && size >= 16) {
        if(info!==null)return null;
        pcm = view.getUint16(offset + 8, true) === 1;
        if(view.getUint32(offset+16,true)!==view.getUint32(offset+12,true)*view.getUint16(offset+10,true)*view.getUint16(offset+22,true)/8 || view.getUint16(offset+20,true)!==view.getUint16(offset+10,true)*view.getUint16(offset+22,true)/8)return null;
        info = {
          sampleRate: view.getUint32(offset + 12, true),
          channels: view.getUint16(offset + 10, true),
          bitsPerSample: view.getUint16(offset + 22, true),
        };
      } else if (id === "data") {
        if(offset+8+size!==bytes.length)return null;
        dataSize = size;
        break;
      }
      offset += 8 + size + (size % 2);
    }
    if (!pcm || !info || dataSize === null || dataSize===0 || dataSize%2!==0) return null;
    const byteRate = (info.sampleRate * info.channels * info.bitsPerSample) / 8;
    if (!Number.isFinite(byteRate) || byteRate <= 0) return null;
    return { ...info, durationSeconds: dataSize / byteRate };
  } catch {
    return null;
  }
};

/**
 * Consent, plan, key and a read-only cap check for the fixed voice endpoint. Transcription always calls Muse
 * Voice Transcribe; it runs on the user's own saved Meta key when there is one, and otherwise follows the same
 * funding rule as other AI actions (fundingLimits).
 */
export const gateVoiceAction = async (
  stores: AiStores,
  limits: AiActionLimits,
  session: SessionRecord,
  env: Env,
): Promise<{ limit: number; remaining: number; limits: AiActionLimits; env: Env }> => {
  const key = userKey(session);
  await requireConsent(stores.consent, key);
  stores.policy=await captureAiPolicy(stores.db??requireBinding(env,"DB"),key);
  const plan = (await getBillingPlan(env, key)).plan;
  const ownKey = await savedMetaKey(env, key);
  const userCheck = await stores.usage.check(key, userDailyLimit(ownKey !== null, plan === "pro" ? limits.pro : limits.free));
  if (userCheck.limited) throw limitError(USER_LIMIT_MESSAGE);
  const funded = fundingLimits(ownKey !== null, limits);
  if (funded.global !== undefined) {
    const globalCheck = await stores.globalBudget.check(funded.globalScope ?? "global", funded.global);
    if (globalCheck.limited) throw funded.globalScope === "demo" ? new ApiError("forbidden", FREE_POOL_MESSAGE) : limitError(GLOBAL_LIMIT_MESSAGE);
  }
  return { limit: userCheck.limit, remaining: userCheck.remaining, limits: funded, env: ownKey === null ? env : withUserOwnedKey(env, ownKey) };
};

export interface VoiceNoteRunResult {
  body: VoiceNoteResult;
  limit: number;
  remaining: number;
}

/**
 * Full voice-note pipeline for signed-in users. Demo sessions and a switched-off flag are
 * rejected upstream and never reach here. The audio lives in memory only: it is sent once
 * to Muse Voice Transcribe and never stored, cached, or logged. One action is reserved
 * around the transcription and released when it throws.
 */
export const transcribeVoiceNote = async (args: {
  db: D1Database;
  fetchImpl: typeof fetch;
  limits: AiActionLimits;
  env: Env;
  session: SessionRecord;
  audio: Uint8Array;
  audioType: VoiceAudioType;
  requestId: string;
  signal?:AbortSignal;
}): Promise<VoiceNoteRunResult> => {
  const { db, fetchImpl, limits, env, session, audio, audioType, requestId } = args;
  const stores = storesFor(db);
  const userId = userKey(session);
  const { limit, limits: funded, env: keyedEnv } = await gateVoiceAction(stores, limits, session, env);
  if(audioType!=="wav")throw new ApiError("validation_failed","Send a WAV recording from MergeMate. Compressed audio cannot be safely duration-checked here.");
  let audioSeconds:number|undefined;
  if (audioType === "wav") {
    const info = readWavInfo(audio);
    const upstreamReady =
      info !== null && info.channels === 1 && info.bitsPerSample === 16 && (info.sampleRate === 16000 || info.sampleRate === 24000);
    if (!upstreamReady) {
      throw new ApiError("validation_failed", "Send 16-bit mono WAV audio at 16 or 24 kHz.");
    }
    audioSeconds=info.durationSeconds;
    if (info.durationSeconds > VOICE_NOTE_MAX_SECONDS) {
      throw new ApiError("validation_failed", "That note is too long.");
    }
  }
  const { contentType, extension } = VOICE_CONTENT_TYPES[audioType];
  const { value: body, remaining: left } = await withReservation(stores, funded, userId, limit, async () => {
    await stores.policy?.assertCurrent();
    const { text } = await transcribeWithMeta({
      env: keyedEnv,
      fetchImpl,
      audio,
      contentType,
      fileName: `note.${extension}`,
      ...(audioSeconds === undefined ? {} : {audioSeconds}),
      ...(args.signal?{signal:args.signal}:{}),
    });
    await stores.policy?.assertCurrent();
    const result: VoiceNoteResult = { text, requestId };
    return result;
  });
  return { body, limit, remaining: left };
};
