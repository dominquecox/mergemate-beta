import type { AiBinding, Env } from "../env";
import { ApiError, ConfigError } from "../errors";
import { resolveRoute } from "./routes";
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

export interface CompletionRequest {
  system: string;
  prompt: string;
  maxOutputTokens: number;
  /** JSON Schema of the expected answer. Used by providers with a native JSON mode; the answer is still validated. */
  jsonSchema?: Record<string, unknown>;
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

const unavailable = () => new ApiError("upstream_unavailable", "The AI service is unavailable. Try again.");

const asCount = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;

interface WorkersAiResult {
  response?: unknown;
  usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
}

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
  const inputs = {
    messages: [
      { role: "system", content: request.system },
      { role: "user", content: request.prompt },
    ],
    max_tokens: request.maxOutputTokens,
    ...(request.jsonSchema ? { response_format: { type: "json_schema", json_schema: request.jsonSchema } } : {}),
  };
  const result = (await (gatewayId
    ? ai.run(config.modelId, inputs, { gateway: { id: gatewayId } })
    : ai.run(config.modelId, inputs))) as WorkersAiResult | null | undefined;
  // JSON mode can return the parsed object instead of a string; either way it is validated downstream.
  const response = result?.response;
  const text = typeof response === "string" ? response : response && typeof response === "object" ? JSON.stringify(response) : "";
  const usage = result?.usage
    ? { inputTokens: asCount(result.usage.prompt_tokens), outputTokens: asCount(result.usage.completion_tokens) }
    : undefined;
  return usage ? { text, usage } : { text };
};

/** Builds the provider for one task from Worker config. Fails before any call when config is missing or invalid. */
export const createModelProvider = (env: Env, task: AiTask, deps: ProviderDeps): ModelProvider => {
  const config = resolveModelConfig(env, task);
  type Send = (request: CompletionRequest) => Promise<{ text: string; usage?: TokenUsage }>;
  let send: Send;
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
      } catch {
        throw unavailable();
      }
      // No partial or invented text: an empty answer is a failure.
      if (!reply.text.trim()) {
        throw new ApiError("upstream_unavailable", "The AI service returned no result. Try again.");
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
