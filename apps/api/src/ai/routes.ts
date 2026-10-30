import type { Env } from "../env";
import { ConfigError } from "../errors";

/**
 * `segment` (region boxes from a vision-segmentation model) and `decision` (typed-question
 * probabilities from a decision model) are not free-form text tasks: see createDecisionProvider.
 */
export const AI_TASKS = ["summary", "risk", "triage", "highlight", "segment", "decision"] as const;
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
  segment: "MODEL_ROUTE_SEGMENT",
  decision: "MODEL_ROUTE_DECISION",
} as const satisfies Record<AiTask, keyof Env>;

interface AllowedRoute extends ModelRoute {
  /** Tasks this route may serve. Highlight needs a vision model; the text tasks need JSON output. */
  tasks: readonly AiTask[];
}

const TEXT_TASKS: readonly AiTask[] = ["summary", "risk", "triage"];

/** `hackathon` keeps Meta in front; `prod` defaults decisions to Cloudflare's Clef. Unset means `hackathon`. */
export const AI_PROFILES = ["hackathon", "prod"] as const;
export type AiProfile = (typeof AI_PROFILES)[number];

export const resolveAiProfile = (env: Env): AiProfile => {
  const value = env.AI_PROFILE?.trim();
  if (!value) return "hackathon";
  if ((AI_PROFILES as readonly string[]).includes(value)) return value as AiProfile;
  throw new ConfigError("AI_PROFILE is not hackathon or prod");
};

/**
 * Routes a profile supplies when a task's own var is unset. Only decisions have one, and only in `prod`;
 * every text route stays explicit config, and the hackathon profile never reaches Workers AI by default.
 */
const PROFILE_DEFAULTS: Record<AiProfile, Partial<Record<AiTask, string>>> = {
  hackathon: {},
  prod: { decision: "workers-ai:@cf/cloudflare/clef-flash" },
};

/**
 * The only routes a task can be configured with. Config picks among these and can never add one.
 * No contributor models: they may use prompts for training, and user code must never reach them.
 */
const ALLOWED_ROUTES: readonly AllowedRoute[] = [
  // Muse Spark on Meta Model API (Responses API): text and image input.
  { provider: "meta", modelId: "muse-spark-1.2", tasks: [...TEXT_TASKS, "highlight"], maxInputChars: 190_000 },
  { provider: "meta", modelId: "muse-spark-1.3", tasks: [...TEXT_TASKS, "highlight"], maxInputChars: 190_000 },
  // SAM 3.1 on Meta Model API (Responses API): returns region boxes for an image, never prose. Segmentation only.
  { provider: "meta", modelId: "sam-3.1", tasks: ["segment"], maxInputChars: 4_000 },
  // Meta's open-weight Muse model on Workers AI: text and vision, 1M-token window. The cap bounds cost, not the window.
  { provider: "workers-ai", modelId: "meta/muse-spark-open", tasks: [...TEXT_TASKS, "highlight"], maxInputChars: 400_000 },
  // 24k-token window: about 50k characters of code leaves room for the system prompt and the answer.
  { provider: "workers-ai", modelId: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", tasks: TEXT_TASKS, maxInputChars: 50_000 },
  { provider: "workers-ai", modelId: "@cf/meta/llama-4-scout-17b-16e-instruct", tasks: ["highlight"], maxInputChars: 190_000 },
  // Clef decision models on Workers AI: typed questions in, probabilities out. Decisions only, never text.
  { provider: "workers-ai", modelId: "@cf/cloudflare/clef", tasks: ["decision"], maxInputChars: 150_000 },
  { provider: "workers-ai", modelId: "@cf/cloudflare/clef-flash", tasks: ["decision"], maxInputChars: 150_000 },
];

/**
 * Reads one task's route from Worker config. Throws on anything unset or not allowed;
 * there is no default and no fallback to another route.
 */
export const resolveRoute = (env: Env, task: AiTask): ModelRoute => {
  const name = ROUTE_VARS[task];
  const value = env[name]?.trim() || PROFILE_DEFAULTS[resolveAiProfile(env)][task];
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
  modelId.startsWith("@cf/cloudflare/clef")
    ? { jsonMode: false, reasoning: false }
    : modelId === "meta/muse-spark-open"
    ? { jsonMode: false, reasoning: true }
    : modelId === "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
      ? { jsonMode: true, reasoning: false }
      : { jsonMode: false, reasoning: false };
