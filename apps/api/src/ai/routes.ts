import type { Env } from "../env";
import { ConfigError } from "../errors";

export const AI_TASKS = ["summary", "risk", "triage", "highlight"] as const;
export type AiTask = (typeof AI_TASKS)[number];

export type ProviderName = "meta" | "workers-ai";

export interface ModelRoute {
  provider: ProviderName;
  modelId: string;
  /** Most PR context, in characters, that fits this model's context window with room for the prompt and answer. */
  maxInputChars: number;
}

/** Worker config var that holds each task's route, written `provider:model`. */
export const ROUTE_VARS = {
  summary: "MODEL_ROUTE_SUMMARY",
  risk: "MODEL_ROUTE_RISK",
  triage: "MODEL_ROUTE_TRIAGE",
  highlight: "MODEL_ROUTE_HIGHLIGHT",
} as const satisfies Record<AiTask, keyof Env>;

interface AllowedRoute extends ModelRoute {
  /** Tasks this route may serve. Highlight needs a vision model; the text tasks need JSON output. */
  tasks: readonly AiTask[];
}

const TEXT_TASKS: readonly AiTask[] = ["summary", "risk", "triage"];

/**
 * The only routes a task can be configured with. Config picks among these and can never add one.
 * No contributor models: they may use prompts for training, and user code must never reach them.
 */
const ALLOWED_ROUTES: readonly AllowedRoute[] = [
  { provider: "meta", modelId: "muse-spark-1.2", tasks: TEXT_TASKS, maxInputChars: 190_000 },
  // Meta's open-weight Muse model on Workers AI: text and vision, 1M-token window. The cap bounds cost, not the window.
  { provider: "workers-ai", modelId: "meta/muse-spark-open", tasks: [...TEXT_TASKS, "highlight"], maxInputChars: 400_000 },
  // 24k-token window: about 50k characters of code leaves room for the system prompt and the answer.
  { provider: "workers-ai", modelId: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", tasks: TEXT_TASKS, maxInputChars: 50_000 },
  { provider: "workers-ai", modelId: "@cf/meta/llama-4-scout-17b-16e-instruct", tasks: ["highlight"], maxInputChars: 190_000 },
];

/**
 * Reads one task's route from Worker config. Throws on anything unset or not allowed;
 * there is no default and no fallback to another route.
 */
export const resolveRoute = (env: Env, task: AiTask): ModelRoute => {
  const name = ROUTE_VARS[task];
  const value = env[name]?.trim();
  if (!value) throw new ConfigError(`${name} is not set`);
  const match = ALLOWED_ROUTES.find(
    (route) => `${route.provider}:${route.modelId}` === value && route.tasks.includes(task),
  );
  if (!match) throw new ConfigError(`${name} is not an allowed route`);
  return { provider: match.provider, modelId: match.modelId, maxInputChars: match.maxInputChars };
};

/** How a Workers AI model is called. Muse Spark Open uses the Chat Completions shape and reasons before answering. */
export interface WorkersAiTraits {
  /** Supports Workers AI JSON mode (`response_format`). Others rely on the schema validation downstream. */
  jsonMode: boolean;
  /** Spends output tokens on reasoning first, so it needs a larger completion budget and a low effort. */
  reasoning: boolean;
}

export const workersAiTraits = (modelId: string): WorkersAiTraits =>
  modelId === "meta/muse-spark-open"
    ? { jsonMode: false, reasoning: true }
    : modelId === "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
      ? { jsonMode: true, reasoning: false }
      : { jsonMode: false, reasoning: false };
