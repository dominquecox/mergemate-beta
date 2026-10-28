import { ErrorBody, VoiceNoteResult } from "@mergemate/contracts";
import { describe, expect, it } from "vitest";
import { transcribeWithMeta, VOICE_TRANSCRIBE_MODEL_ID } from "../src/ai/provider";
import { VOICE_NOTE_MAX_BYTES, readWavInfo, storesFor } from "../src/routes/ai-engine";
import { demoHeaders } from "./demo-session";
import { TEST_API_KEY, fakeDataset, json, testContext, validModelEnv } from "./helpers";
import { appFor, signIn } from "./sign-in";

const wavBytes = (opts: {
  sampleRate?: number;
  channels?: number;
  bits?: number;
  dataSize?: number;
  claimedDataSize?: number;
  pcm?: boolean;
} = {}): Uint8Array => {
  const { sampleRate = 16000, channels = 1, bits = 16, dataSize = 320, claimedDataSize, pcm = true } = opts;
  const header = new Uint8Array(44);
  const view = new DataView(header.buffer);
  const ascii = (at: number, word: string) => {
    for (let index = 0; index < word.length; index += 1) header[at + index] = word.charCodeAt(index);
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, pcm ? 1 : 3, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, (sampleRate * channels * bits) / 8, true);
  view.setUint16(32, (channels * bits) / 8, true);
  view.setUint16(34, bits, true);
  ascii(36, "data");
  view.setUint32(40, claimedDataSize ?? dataSize, true);
  const out = new Uint8Array(44 + dataSize);
  out.set(header);
  return out;
};

const m4aBytes = (): Uint8Array => {
  const bytes = new Uint8Array(32);
  bytes.set([0x66, 0x74, 0x79, 0x70], 4);
  return bytes;
};

const aacBytes = (): Uint8Array => {
  const bytes = new Uint8Array(32);
  bytes.set([0xff, 0xf1], 0);
  return bytes;
};

const webmBytes = (): Uint8Array => {
  const bytes = new Uint8Array(32);
  bytes.set([0x1a, 0x45, 0xdf, 0xa3], 0);
  return bytes;
};

const audioFile = (bytes: Uint8Array, name = "note.wav") => new File([bytes], name, { type: "audio/wav" });

const audioForm = (file: File) => {
  const form = new FormData();
  form.append("audio", file);
  return form;
};

const flagOn = (ctx: ReturnType<typeof testContext>) => {
  ctx.kv.set("flags:v1", JSON.stringify({ voice_notes: true }));
};

const grant = async (call: ReturnType<typeof appFor>, headers: Record<string, string>) => {
  const res = await call("/v1/consent", {
    method: "PUT",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ ai: { granted: true, version: "1" } }),
  });
  if (res.status !== 200) throw new Error(`consent grant failed: ${res.status}`);
};

describe("voice-notes route", () => {
  it("requires sign-in", async () => {
    const ctx = testContext();
    const res = await appFor(ctx)("/v1/voice-notes", { method: "POST", body: audioForm(audioFile(wavBytes())) });
    expect(res.status).toBe(401);
  });

  it("stays missing while the flag is off", async () => {
    const ctx = testContext();
    const call = appFor(ctx);
    const { headers } = await signIn(ctx, "ios");
    const res = await call("/v1/voice-notes", { method: "POST", headers, body: audioForm(audioFile(wavBytes())) });
    expect(res.status).toBe(404);
    expect(ErrorBody.parse(await res.json()).error.code).toBe("not_found");
  });

  it("keeps demo recordings out", async () => {
    const ctx = testContext();
    flagOn(ctx);
    const headers = await demoHeaders(ctx);
    const res = await appFor(ctx)("/v1/voice-notes", {
      method: "POST",
      headers,
      body: audioForm(audioFile(wavBytes())),
    });
    expect(res.status).toBe(403);
  });

  it("requires consent before transcription", async () => {
    const ctx = testContext();
    flagOn(ctx);
    const call = appFor(ctx);
    const { headers } = await signIn(ctx, "ios");
    const res = await call("/v1/voice-notes", { method: "POST", headers, body: audioForm(audioFile(wavBytes())) });
    expect(res.status).toBe(403);
  });

  it("validates magic bytes, not the file name", async () => {
    const ctx = testContext();
    flagOn(ctx);
    const call = appFor(ctx);
    const { headers } = await signIn(ctx, "ios");
    await grant(call, headers);
    const res = await call("/v1/voice-notes", {
      method: "POST",
      headers,
      body: audioForm(audioFile(new TextEncoder().encode("not audio at all"), "note.wav")),
    });
    expect(res.status).toBe(422);
  });

  it("rejects oversized recordings", async () => {
    const ctx = testContext();
    flagOn(ctx);
    const call = appFor(ctx);
    const { headers } = await signIn(ctx, "ios");
    await grant(call, headers);
    const res = await call("/v1/voice-notes", {
      method: "POST",
      headers,
      body: audioForm(audioFile(new Uint8Array(VOICE_NOTE_MAX_BYTES + 1), "big.wav")),
    });
    expect(res.status).toBe(413);
  });

  it("rejects WAV the upstream cannot take", async () => {
    const ctx = testContext();
    flagOn(ctx);
    const call = appFor(ctx);
    const { headers } = await signIn(ctx, "ios");
    await grant(call, headers);
    const stereo = await call("/v1/voice-notes", {
      method: "POST",
      headers,
      body: audioForm(audioFile(wavBytes({ channels: 2 }))),
    });
    expect(stereo.status).toBe(422);
    const float = await call("/v1/voice-notes", {
      method: "POST",
      headers,
      body: audioForm(audioFile(wavBytes({ pcm: false }))),
    });
    expect(float.status).toBe(422);
  });

  it("rejects notes past the duration cap", async () => {
    const ctx = testContext();
    flagOn(ctx);
    const call = appFor(ctx);
    const { headers } = await signIn(ctx, "ios");
    await grant(call, headers);
    // The duration comes from the header, so the body stays small.
    const long = wavBytes({ dataSize: 64, claimedDataSize: 121 * 32000 });
    const res = await call("/v1/voice-notes", { method: "POST", headers, body: audioForm(audioFile(long)) });
    expect(res.status).toBe(422);
  });
});

describe("voice-notes transcription", () => {
  const successContext = (text = "fix the checkout button") => {
    const ctx = testContext({ ...validModelEnv() });
    flagOn(ctx);
    ctx.net.on("POST", "https://api.meta.ai/v1/asr/transcribe", () => json({ text }));
    return ctx;
  };

  it('records voice duration and latency without audio, transcript, filename, identity or credentials',async()=>{
    const metrics=fakeDataset();const ctx=testContext({...validModelEnv(),AI_METRICS:metrics});flagOn(ctx);
    const transcript='PRIVATE_TRANSCRIPT_MARKER';ctx.net.on('POST','https://api.meta.ai/v1/asr/transcribe',()=>json({text:transcript}));
    const call=appFor(ctx);const {headers,userId}=await signIn(ctx,'ios');await grant(call,headers);
    const res=await call('/v1/voice-notes',{method:'POST',headers,body:audioForm(audioFile(wavBytes({dataSize:49600}),'PRIVATE_FILENAME.wav'))});
    expect(res.status).toBe(200);expect(metrics.points).toHaveLength(1);
    expect(metrics.points[0]?.blobs).toEqual(['voice','meta',VOICE_TRANSCRIBE_MODEL_ID,'ok']);
    expect(metrics.points[0]?.doubles?.slice(0,2)).toEqual([0,0]);expect(metrics.points[0]?.doubles?.[2]).toBeGreaterThanOrEqual(0);
    expect(metrics.points[0]?.doubles?.slice(3)).toEqual([1.55,1,1]);
    const encoded=JSON.stringify(metrics.points);for(const marker of [transcript,'PRIVATE_FILENAME',userId,TEST_API_KEY,'RIFF'])expect(encoded).not.toContain(marker);
  });
  it('records unknown duration explicitly and never invents seconds for compressed formats',async()=>{
    const metrics=fakeDataset();const ctx=testContext({...validModelEnv(),AI_METRICS:metrics});flagOn(ctx);
    ctx.net.on('POST','https://api.meta.ai/v1/asr/transcribe',()=>json({text:'fixture'}));const call=appFor(ctx);const {headers}=await signIn(ctx,'ios');await grant(call,headers);
    expect((await call('/v1/voice-notes',{method:'POST',headers,body:audioForm(audioFile(m4aBytes()))})).status).toBe(200);
    expect(metrics.points[0]?.doubles?.slice(3)).toEqual([0,0,0]);
  });
  it('records one failure including retry latency, but no metric for validation before an upstream call',async()=>{
    const metrics=fakeDataset();const ctx=testContext({...validModelEnv(),AI_METRICS:metrics});flagOn(ctx);
    ctx.net.on('POST','https://api.meta.ai/v1/asr/transcribe',()=>json({error:'fixture'},500));const call=appFor(ctx);const {headers}=await signIn(ctx,'ios');await grant(call,headers);
    expect((await call('/v1/voice-notes',{method:'POST',headers,body:audioForm(audioFile(wavBytes({channels:2})))})).status).toBe(422);expect(metrics.points).toHaveLength(0);
    expect((await call('/v1/voice-notes',{method:'POST',headers,body:audioForm(audioFile(wavBytes()))})).status).toBe(502);
    expect(metrics.points).toHaveLength(1);expect(metrics.points[0]?.blobs?.[3]).toBe('upstream_error');expect(metrics.points[0]?.doubles?.[2]).toBeGreaterThanOrEqual(0);
  });
  it('keeps successful transcription available if metrics fails or the binding is absent',async()=>{
    const metrics=fakeDataset(true);const ctx=testContext({...validModelEnv(),AI_METRICS:metrics});flagOn(ctx);
    ctx.net.on('POST','https://api.meta.ai/v1/asr/transcribe',()=>json({text:'fixture'}));const call=appFor(ctx);const {headers}=await signIn(ctx,'ios');await grant(call,headers);
    expect((await call('/v1/voice-notes',{method:'POST',headers,body:audioForm(audioFile(wavBytes()))})).status).toBe(200);
  });

  it("transcribes a real recording and counts one action", async () => {
    const ctx = successContext();
    const call = appFor(ctx);
    const { headers } = await signIn(ctx, "ios");
    await grant(call, headers);
    const res = await call("/v1/voice-notes", {
      method: "POST",
      headers,
      body: audioForm(audioFile(wavBytes())),
    });
    expect(res.status).toBe(200);
    const body = VoiceNoteResult.parse(await res.json());
    expect(body.text).toBe("fix the checkout button");
    expect(body.requestId).toBe(res.headers.get("x-request-id"));
    expect(res.headers.get("x-actions-limit")).toBe("30");
    expect(res.headers.get("x-actions-remaining")).toBe("29");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("forwards m4a, aac and webm by magic bytes", async () => {
    for (const bytes of [m4aBytes(), aacBytes(), webmBytes()]) {
      const ctx = successContext("noted");
      const call = appFor(ctx);
      const { headers } = await signIn(ctx, "ios");
      await grant(call, headers);
      const res = await call("/v1/voice-notes", {
        method: "POST",
        headers,
        body: audioForm(audioFile(bytes, "note.audio")),
      });
      expect(res.status).toBe(200);
    }
  });

  it("releases the reservation when transcription fails", async () => {
    const ctx = testContext({ ...validModelEnv() });
    flagOn(ctx);
    ctx.net.on("POST", "https://api.meta.ai/v1/asr/transcribe", () => json({ error: "down" }, 500));
    const call = appFor(ctx);
    const { headers, userId } = await signIn(ctx, "ios");
    await grant(call, headers);
    const res = await call("/v1/voice-notes", {
      method: "POST",
      headers,
      body: audioForm(audioFile(wavBytes())),
    });
    expect(res.status).toBe(502);
    const check = await storesFor(ctx.db as unknown as D1Database).usage.check(userId, 30);
    expect(check.remaining).toBe(30);
  });

  it("treats rejected audio as a client error", async () => {
    const ctx = testContext({ ...validModelEnv() });
    flagOn(ctx);
    ctx.net.on("POST", "https://api.meta.ai/v1/asr/transcribe", () => json({ error: "bad audio" }, 400));
    const call = appFor(ctx);
    const { headers } = await signIn(ctx, "ios");
    await grant(call, headers);
    const res = await call("/v1/voice-notes", {
      method: "POST",
      headers,
      body: audioForm(audioFile(wavBytes())),
    });
    expect(res.status).toBe(422);
    expect(ErrorBody.parse(await res.json()).error.code).toBe("validation_failed");
  });

  it("treats empty transcripts as unusable", async () => {
    const ctx = successContext("   ");
    const call = appFor(ctx);
    const { headers } = await signIn(ctx, "ios");
    await grant(call, headers);
    const res = await call("/v1/voice-notes", {
      method: "POST",
      headers,
      body: audioForm(audioFile(wavBytes())),
    });
    expect(res.status).toBe(422);
  });
});

describe("readWavInfo", () => {
  it("reads format, rate and duration from the header", async () => {
    const info = readWavInfo(wavBytes({ sampleRate: 24000, dataSize: 48000 }));
    expect(info).toMatchObject({ sampleRate: 24000, channels: 1, bitsPerSample: 16 });
    expect(info?.durationSeconds).toBeCloseTo(1, 5);
  });

  it("returns null for non-PCM or truncated audio", async () => {
    expect(readWavInfo(wavBytes({ pcm: false }))).toBeNull();
    expect(readWavInfo(wavBytes().slice(0, 20))).toBeNull();
    expect(readWavInfo(m4aBytes())).toBeNull();
  });
});

describe("transcribeWithMeta", () => {
  it("refuses a redirect instead of following it", async () => {
    const fetchImpl = (async () => new Response(null, { status: 302, headers: { location: "https://elsewhere.example" } })) as typeof fetch;
    await expect(
      transcribeWithMeta({ env: { ...validModelEnv() }, fetchImpl, audio: m4aBytes(), contentType: "audio/mp4", fileName: "note.m4a" }),
    ).rejects.toMatchObject({ code: "upstream_unavailable" });
  });
  it("posts multipart audio with the model id and Bearer [REDACTED]", async () => {
    const seen: { url: unknown; init: RequestInit | undefined }[] = [];
    const fetchImpl = (async (url: unknown, init?: RequestInit) => {
      seen.push({ url, init });
      return new Response(JSON.stringify({ text: "  hi  " }), { status: 200 });
    }) as typeof fetch;
    const { text } = await transcribeWithMeta({
      env: { ...validModelEnv() },
      fetchImpl,
      audio: m4aBytes(),
      contentType: "audio/mp4",
      fileName: "note.m4a",
    });
    expect(text).toBe("hi");
    expect(seen).toHaveLength(1);
    expect(seen[0]?.init?.redirect).toBe("manual");
    expect(String(seen[0]?.url)).toBe("https://api.meta.ai/v1/asr/transcribe");
    expect((seen[0]?.init?.headers as Record<string, string>).authorization).toBe(`Bearer ${TEST_API_KEY}`);
    const body = seen[0]?.init?.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get("model")).toBe(VOICE_TRANSCRIBE_MODEL_ID);
    const file = body.get("file");
    expect(file).toBeInstanceOf(File);
    const audio = file as unknown as File;
    expect(audio.name).toBe("note.m4a");
    expect(audio.type).toBe("audio/mp4");
  });

  it("retries once on a 429 then reports unavailable", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response("{}", { status: 429 });
    }) as typeof fetch;
    await expect(
      transcribeWithMeta({
        env: { ...validModelEnv() },
        fetchImpl,
        audio: wavBytes(),
        contentType: "audio/wav",
        fileName: "note.wav",
      }),
    ).rejects.toMatchObject({ code: "upstream_unavailable" });
    expect(calls).toBe(2);
  });
});
