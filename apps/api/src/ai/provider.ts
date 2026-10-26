import type { Env } from "../env";
import { ApiError, ConfigError } from "../errors";

export const SUPPORTED_PROVIDERS = ["meta"] as const;
export type ProviderName = (typeof SUPPORTED_PROVIDERS)[number];

/** Resolved model settings. Holds no secrets, so it is safe to log. */
export interface ModelConfig {
  provider: ProviderName;
  modelId: string;
  baseUrl: string;
}

export interface CompletionRequest {
  system: string;
  prompt: string;
  maxOutputTokens: number;
}

export interface CompletionResult {
  text: string;
  provider: ProviderName;
  modelId: string;
}

/** Sends one request to the configured model. Implementations must not log the key or request content. */
export interface ModelTransport {
  complete(input: {
    config: ModelConfig;
    apiKey: string;
    request: CompletionRequest;
  }): Promise<{ text: string }>;
}

export interface ModelProvider {
  readonly config: ModelConfig;
  complete(request: CompletionRequest): Promise<CompletionResult>;
}

const MODEL_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

const isSupported = (value: string): value is ProviderName =>
  (SUPPORTED_PROVIDERS as readonly string[]).includes(value);

const required = (env: Env, name: "MODEL_PROVIDER" | "MODEL_ID" | "MODEL_BASE_URL") => {
  const value = env[name]?.trim();
  if (!value) throw new ConfigError(`${name} is not set`);
  return value;
};

/**
 * Reads provider and model from Worker config. Throws on anything missing or invalid;
 * there is no default and no fallback to another provider or model.
 */
export const resolveModelConfig = (env: Env): ModelConfig => {
  const provider = required(env, "MODEL_PROVIDER");
  if (!isSupported(provider)) throw new ConfigError("MODEL_PROVIDER is not supported");

  const modelId = required(env, "MODEL_ID");
  if (!MODEL_ID_PATTERN.test(modelId)) throw new ConfigError("MODEL_ID is not a valid model id");
  // Contributor models may use prompts for training; user code must never reach them.
  if (modelId.includes("contributor")) throw new ConfigError("MODEL_ID must not be a contributor model");

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

  return { provider, modelId, baseUrl: url.href.replace(/\/+$/, "") };
};

const requireApiKey = (env: Env) => {
  const key = env.MODEL_API_KEY?.trim();
  if (!key) throw new ConfigError("MODEL_API_KEY is not set");
  return key;
};

/** Builds the provider from Worker config. Fails before any call when config is missing or invalid. */
export const createModelProvider = (env: Env, transport: ModelTransport): ModelProvider => {
  const config = resolveModelConfig(env);
  const apiKey = requireApiKey(env);

  return {
    config,
    async complete(request) {
      let text: string;
      try {
        ({ text } = await transport.complete({ config, apiKey, request }));
      } catch {
        throw new ApiError("upstream_unavailable", "The AI service is unavailable. Try again.");
      }
      // No partial or invented text: an empty answer is a failure.
      if (!text.trim()) {
        throw new ApiError("upstream_unavailable", "The AI service returned no result. Try again.");
      }
      return { text, provider: config.provider, modelId: config.modelId };
    },
  };
};
