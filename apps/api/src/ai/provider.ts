import { recordAiCall, type AiOutcome } from "./metrics";
import type { AiBinding, Env } from "../env";
import { ApiError, ConfigError } from "../errors";
import { resolveRoute, workersAiTraits } from "./routes";
import type { AiTask, ProviderName } from "./routes";

export type { ProviderName } from "./routes";

/** Resolved settings for a Meta route. Holds no secrets, so it is safe to log. */
export interface MetaModelConfig {
  provider: "meta";
  modelId: string;
  maxInputChars: number;
  baseUrl: string;
}

/** Resolved settings for a Workers AI route. */
export interface WorkersAiModelConfig {
  provider: "workers-ai";
  modelId: string;
  maxInputChars: number;
}

export type ModelConfig = MetaModelConfig | WorkersAiModelConfig;

/**
 * One screenshot for a vision model, as a data URL. Only the highlight task sends one,
 * and only routes allowed for highlight receive it.
 */
export interface ImageInput {
  dataUrl: string;
}

export interface CompletionRequest {
  system: string;
  prompt: string;
  maxOutputTokens: number;
  /** JSON Schema of the expected answer. Used by providers with a native JSON mode; the answer is still validated. */
  jsonSchema?: Record<string, unknown>;
  /** Screenshot for a vision model; sent only on routes allowed for highlight. */
  image?: ImageInput | undefined;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface CompletionResult {
  text: string;
  provider: ProviderName;
  modelId: string;
  usage?: TokenUsage;
}

/** Sends one request to a Meta model. Implementations must not log the key or request content. */
export interface ModelTransport {
  complete(input: {
    config: MetaModelConfig;
    apiKey: string;
    request: CompletionRequest;
  }): Promise<{ text: string; usage?: TokenUsage }>;
}

export interface ModelProvider {
  readonly config: ModelConfig;
  complete(request: CompletionRequest): Promise<CompletionResult>;
}

/** What a provider needs from outside the Worker. Injected so tests never make a real call. */
export interface ProviderDeps {
  transport: ModelTransport;
  ai?: AiBinding | undefined;
}

const required = (env: Env, name: "MODEL_BASE_URL") => {
  const value = env[name]?.trim();
  if (!value) throw new ConfigError(`${name} is not set`);
  return value;
};

const resolveBaseUrl = (env: Env): string => {
  const baseUrl = required(env, "MODEL_BASE_URL");
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new ConfigError("MODEL_BASE_URL is not a valid URL");
  }
  if (url.protocol !== "https:") throw new ConfigError("MODEL_BASE_URL must use https");
  if (url.username || url.password || url.search || url.hash) {
    throw new ConfigError("MODEL_BASE_URL must not carry credentials, query or fragment");
  }
  return url.href.replace(/\/+$/, "");
};

/**
 * Resolves the task's route from Worker config. Throws on anything missing or not allowed;
 * there is no default and no fallback to another provider or model.
 */
export const resolveModelConfig = (env: Env, task: AiTask): ModelConfig => {
  const route = resolveRoute(env, task);
  if (route.provider === "meta") {
    return { provider: "meta", modelId: route.modelId, maxInputChars: route.maxInputChars, baseUrl: resolveBaseUrl(env) };
  }
  return { provider: "workers-ai", modelId: route.modelId, maxInputChars: route.maxInputChars };
};

const requireApiKey = (env: Env) => {
  const key = env.MODEL_API_KEY?.trim();
  if (!key) throw new ConfigError("MODEL_API_KEY is not set");
  return key;
};

/**
 * Marks a per-request env whose MODEL_API_KEY is the person's own saved Meta key (not a Worker setting), so a
 * rejected key is reported to them instead of as a MergeMate setup problem.
 */
export const USER_OWNED_KEY: unique symbol = Symbol("userOwnedMetaKey");
type KeyedEnv = Env & { [USER_OWNED_KEY]?: true };
export const withUserOwnedKey = (env: Env, key: string): Env => ({ ...env, MODEL_API_KEY: key, [USER_OWNED_KEY]: true }) as KeyedEnv;

/** A model service answered with a non-success HTTP status. Carries the status only, never the body. */
export class UpstreamStatusError extends Error {
  override readonly name = "UpstreamStatusError";
  constructor(readonly status: number) {
    super(`upstream status ${status}`);
  }
}

const unavailable = (logDetail?: string) =>
  new ApiError("upstream_unavailable", "The AI service is unavailable. Try again.", {}, logDetail);

/** Log-only reason for a failed model call: our own error text (status codes, timeouts), capped. Never request content. */
const failureDetail = (config: ModelConfig, error: unknown): string =>
  `${config.provider}:${config.modelId} ${error instanceof Error ? `${error.name}: ${error.message}` : "unknown error"}`.slice(0, 200);

const asCount = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;

interface WorkersAiResult {
  response?: unknown;
  /** Chat Completions shape, used by third-party models such as Muse Spark Open. */
  choices?: { message?: { content?: unknown } }[];
  usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
}

/** A reasoning model spends tokens thinking first; give it room so the answer is not cut off. */
const REASONING_MIN_COMPLETION_TOKENS = 4096;

/**
 * One Workers AI call. The prompt is the same delimited data under the same fixed system prompt as
 * every other provider. A thrown error, including "JSON Mode couldn't be met", is a failed call.
 */
const completeWithWorkersAi = async (
  config: WorkersAiModelConfig,
  ai: AiBinding,
  gatewayId: string | undefined,
  request: CompletionRequest,
): Promise<{ text: string; usage?: TokenUsage }> => {
  // Vision input follows the Workers AI image-text shape: the screenshot travels as an
  // image part inside the user message, alongside the text. Text tasks keep a plain string.
  const userContent = request.image
    ? [
        { type: "text", text: request.prompt },
        { type: "image_url", image_url: { url: request.image.dataUrl } },
      ]
    : request.prompt;
  const traits = workersAiTraits(config.modelId);
  const inputs = {
    messages: [
      { role: "system", content: request.system },
      { role: "user", content: userContent },
    ],
    ...(traits.reasoning
      ? {
          max_completion_tokens: Math.max(request.maxOutputTokens * 8, REASONING_MIN_COMPLETION_TOKENS),
          reasoning_effort: "low",
        }
      : { max_tokens: request.maxOutputTokens }),
    ...(traits.jsonMode && request.jsonSchema
      ? { response_format: { type: "json_schema", json_schema: request.jsonSchema } }
      : {}),
  };
  const result = (await (gatewayId
    ? ai.run(config.modelId, inputs, { gateway: { id: gatewayId } })
    : ai.run(config.modelId, inputs))) as WorkersAiResult | null | undefined;
  // JSON mode can return the parsed object instead of a string; either way it is validated downstream.
  const response = result?.response;
  const chat = result?.choices?.[0]?.message?.content;
  const text =
    typeof response === "string"
      ? response
      : response && typeof response === "object"
        ? JSON.stringify(response)
        : typeof chat === "string"
          ? chat
          : "";
  const usage = result?.usage
    ? { inputTokens: asCount(result.usage.prompt_tokens), outputTokens: asCount(result.usage.completion_tokens) }
    : undefined;
  return usage ? { text, usage } : { text };
};

/**
 * Muse Voice Transcribe on Meta Model API. Verified 2026-10-27 against Meta's model page
 * and developer docs via a third-party reference: model id `muse-voice-transcribe-1.0`,
 * $0.18 per audio hour ($3.00 per 1,000 minutes, same for streaming and file), batch
 * endpoint POST `{base}/asr/transcribe` as multipart with an Authorization Bearer header.
 * The file path takes mono 16-bit PCM WAV at 16 or 24 kHz only, max 32 MB and 10 minutes
 * per request. Multipart field names and the response shape follow the OpenAI-compatible
 * transcription convention (`file` + `model` fields, `{text}` reply); confirm both on the
 * first live call, since this track makes none.
 */
export const VOICE_TRANSCRIBE_MODEL_ID = "muse-voice-transcribe-1.0";

/** Transcription gives minutes-long audio room; chat calls use the shorter transport timeout. */
const TRANSCRIBE_TIMEOUT_MS = 120_000;

const transcribeRejected = () =>
  new ApiError("validation_failed", "The audio was not accepted. Try a shorter note.");

const transcribeUnavailable = () =>
  new ApiError("upstream_unavailable", "Transcription is unavailable right now. Try again later.");

/**
 * Sends one recording to Muse Voice Transcribe. Same auth, timeout, retry-once and
 * redirect rules as the Meta chat transport; only the body shape differs (multipart).
 * The audio is never logged, cached, or stored.
 */
export const transcribeWithMeta = async (args: {
  env: Env;
  fetchImpl: typeof fetch;
  audio: Uint8Array;
  contentType: string;
  fileName: string;
  audioSeconds?: number;
}): Promise<{ text: string }> => {
  const { env, fetchImpl, audio, contentType, fileName } = args;
  const apiKey = requireApiKey(env);
  const form = new FormData();
  form.append("file", new File([audio], fileName, { type: contentType }));
  form.append("model", VOICE_TRANSCRIBE_MODEL_ID);
  const baseUrl=resolveBaseUrl(env);
  const started=Date.now();
  let outcome:AiOutcome="upstream_error";
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let res: Response;
      try {
        res = await fetchImpl(`${baseUrl}/asr/transcribe`, {
          method: "POST",
          headers: { authorization: `Bearer ${apiKey}` },
          body: form,
          signal: AbortSignal.timeout(TRANSCRIBE_TIMEOUT_MS),
          // Workers reject redirect: "error"; "manual" returns a 3xx as-is and it is refused below.
          redirect: "manual",
        });
      } catch {
        throw transcribeUnavailable();
      }
      if (res.status >= 300 && res.status < 400) throw transcribeUnavailable();
      if (res.status === 429 || res.status >= 500) {
        if (attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          continue;
        }
        throw transcribeUnavailable();
      }
      if (res.status >= 400) {outcome="invalid_output";throw transcribeRejected();}
      let data: unknown;
      try {
        data = (await res.json()) as unknown;
      } catch {
        throw transcribeUnavailable();
      }
      const text = (data as { text?: unknown })?.text;
      if (typeof text !== "string" || !text.trim()) {outcome="invalid_output";throw transcribeRejected();}
      outcome="ok";
      return { text: text.trim() };
    }
    throw transcribeUnavailable();
  } finally {
    recordAiCall(env.AI_METRICS,{task:'voice',provider:'meta',modelId:VOICE_TRANSCRIBE_MODEL_ID,outcome,inputTokens:0,outputTokens:0,latencyMs:Math.max(0,Date.now()-started),...(args.audioSeconds === undefined ? {} : {audioSeconds:args.audioSeconds})});
  }
};

/** Builds the provider for one task from Worker config. Fails before any call when config is missing or invalid. */
export const createModelProvider = (env: Env, task: AiTask, deps: ProviderDeps): ModelProvider => {
  const config = resolveModelConfig(env, task);
  type Send = (request: CompletionRequest) => Promise<{ text: string; usage?: TokenUsage }>;
  let send: Send;
  const userOwnedKey = (env as KeyedEnv)[USER_OWNED_KEY] === true;
  if (config.provider === "meta") {
    const apiKey = requireApiKey(env);
    send = (request) => deps.transport.complete({ config, apiKey, request });
  } else {
    const ai = deps.ai;
    if (!ai) throw new ConfigError("AI binding is missing");
    const gatewayId = env.AI_GATEWAY_ID?.trim() || undefined;
    send = (request) => completeWithWorkersAi(config, ai, gatewayId, request);
  }

  return {
    config,
    async complete(request) {
      let reply: { text: string; usage?: TokenUsage };
      try {
        reply = await send(request);
      } catch (error) {
        if (error instanceof ApiError && error.code === "misconfigured") throw error;
        // A rejected key is a setup problem, not an outage: retrying cannot fix it.
        if (error instanceof UpstreamStatusError && (error.status === 401 || error.status === 403)) {
          if (userOwnedKey) {
            throw new ApiError("forbidden", "Meta rejected your saved key. Replace or remove it in web Settings.", {},
              `${config.provider}:${config.modelId} user key rejected (${error.status})`);
          }
          throw new ConfigError(`MODEL_API_KEY rejected by ${config.provider} (${error.status})`);
        }
        throw unavailable(failureDetail(config, error));
      }
      // No partial or invented text: an empty answer is a failure.
      if (!reply.text.trim()) {
        throw new ApiError("upstream_unavailable", "The AI service returned no result. Try again.", {}, `${config.provider}:${config.modelId} empty text`);
      }
      return {
        text: reply.text,
        provider: config.provider,
        modelId: config.modelId,
        ...(reply.usage ? { usage: reply.usage } : {}),
      };
    },
  };
};
