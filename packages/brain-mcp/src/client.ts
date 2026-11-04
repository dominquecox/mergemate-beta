/**
 * MM-119: HTTP client for the merged MM-115 brain agent API.
 *
 * Served at `/agent/v1/brain/*` (see `apps/api/src/routes/brain.ts`).
 * Agent, tool and actor identity always come from the per-agent token, never
 * from log or display code: the token is held in memory only and every error
 * carries the status, never the body. Responses are parsed with the shared
 * `@mergemate/contracts` schemas; anything else is refused.
 */
import {
  CardHandoffRequestSchema,
  CardHeartbeatRequestSchema,
  CardLockRequestSchema,
  CardSchema,
  LinkPrRequestSchema,
  LockSchema,
  ProceedWithTrackRequestSchema,
  ProceedWithTrackResponseSchema,
  ProjectSchema,
  ToolSchema,
  TrackEventSchema,
  TrackLogRequestSchema,
  type Card,
  type CardHandoffRequest,
  type CardHeartbeatRequest,
  type CardLockRequest,
  type LinkPrRequest,
  type Lock,
  type ProceedWithTrackResponse,
  type Project,
  type Tool,
  type TrackEvent,
  type TrackLogRequest,
} from "@mergemate/contracts";
import { z } from "zod";

export const BRAIN_UNAVAILABLE = "brain_unavailable";

export class BrainUnavailableError extends Error {
  readonly code: string = BRAIN_UNAVAILABLE;
  constructor(message = "The brain API is unavailable (not merged, disabled, or unreachable). No request was completed.") {
    super(message);
  }
}

/** Minimal fetch shape so tests can stub the transport. */
export type FetchImpl = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<{ status: number; text: () => Promise<string> }>;

export interface BrainClientOptions {
  baseUrl: string;
  /** Per-agent API token (`mmb_…`). Held in memory only; never logged. */
  agentToken: string;
  fetchImpl?: FetchImpl | undefined;
}

const BoardResponseSchema = z
  .object({ project: ProjectSchema, cards: z.array(CardSchema), trackTail: z.array(TrackEventSchema) })
  .strict();
const LockResponseSchema = z.object({ lock: LockSchema.nullable() }).strict();
const HandoffResponseSchema = z.object({ handedOff: z.literal(true) }).strict();
const LogResponseSchema = z.object({ logged: z.literal(true) }).strict();
const PrResponseSchema = z.object({ card: CardSchema }).strict();

/** Largest API body accepted; anything bigger is refused before parsing. A full board (500 cards with long details) fits well inside. */
const MAX_BODY_BYTES = 16 * 1024 * 1024;

const ApiErrorSchema = z.object({ error: z.object({ code: z.string().regex(/^[a-z_]{1,64}$/), message: z.string().min(1).max(500) }) });
const apiErrorOf = (text: string): { code: string; message: string } | null => {
  try {
    const parsed = ApiErrorSchema.safeParse(JSON.parse(text) as unknown);
    return parsed.success ? parsed.data.error : null;
  } catch {
    return null;
  }
};

/** Adapts the runtime's fetch (Node 22+) to the minimal transport shape. */
const defaultFetch: FetchImpl = async (url, init) => {
  if (typeof globalThis.fetch !== "function") throw new BrainUnavailableError("This runtime has no fetch.");
  const response = await globalThis.fetch(url, { ...init, redirect: "error" });
  return { status: response.status, text: () => response.text() };
};

export type { Card, CardHandoffRequest, CardHeartbeatRequest, CardLockRequest, LinkPrRequest, Lock, ProceedWithTrackResponse, Project, Tool, TrackEvent, TrackLogRequest };
export {
  CardHandoffRequestSchema,
  CardHeartbeatRequestSchema,
  CardLockRequestSchema,
  LinkPrRequestSchema,
  ProceedWithTrackRequestSchema,
  ToolSchema,
  TrackLogRequestSchema,
};

export class BrainApiClient {
  private readonly baseUrl: string;
  private readonly agentToken: string;
  private readonly fetchImpl: FetchImpl;

  constructor(options: BrainClientOptions) {
    const base = options.baseUrl.trim().replace(/\/+$/, "");
    if (!/^https:\/\//.test(base) && !/^http:\/\/localhost(:\d+)?$/.test(base)) {
      throw new BrainUnavailableError("Refusing a non-https brain API base URL (localhost allowed for tests).");
    }
    if (!options.agentToken) throw new BrainUnavailableError("An agent token is required.");
    this.baseUrl = `${base}/agent/v1/brain`;
    this.agentToken = options.agentToken;
    // The real server uses the runtime's fetch; tests pass a stub.
    this.fetchImpl = options.fetchImpl ?? defaultFetch;
  }

  private async request<T>(method: string, path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
    let response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: { "content-type": "application/json", authorization: `Bearer ${this.agentToken}` },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new BrainUnavailableError();
    }
    const text = await response.text();
    if (response.status < 200 || response.status >= 300) {
      // The API's own error body carries a code and a fixed message (never the token), so the agent learns
      // why, e.g. "not_found: No open card is free right now." Anything else is reported by status only.
      const apiError = text.length <= MAX_BODY_BYTES ? apiErrorOf(text) : null;
      if (apiError) throw new Error(`brain_api_error: ${apiError.code}: ${apiError.message}`);
      if (response.status === 404 || response.status === 501) throw new BrainUnavailableError();
      throw new Error("brain_api_error: status " + response.status);
    }
    if (text.length > MAX_BODY_BYTES) throw new Error("brain_api_error: response too large");
    let data: unknown;
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      throw new Error("brain_api_error: invalid JSON");
    }
    const parsed = schema.safeParse(data);
    if (!parsed.success) throw new Error("brain_api_error: invalid shape");
    return parsed.data;
  }

  boardRead(): Promise<{ project: Project; cards: Card[]; trackTail: TrackEvent[] }> {
    return this.request("GET", "/board", undefined, BoardResponseSchema);
  }

  proceedWithTrack(projectId: string): Promise<ProceedWithTrackResponse> {
    const body = ProceedWithTrackRequestSchema.parse({ projectId });
    return this.request("POST", "/proceed", body, ProceedWithTrackResponseSchema);
  }

  cardLock(body: CardLockRequest): Promise<{ lock: Lock | null }> {
    return this.request("POST", "/lock", CardLockRequestSchema.parse(body), LockResponseSchema);
  }

  cardHeartbeat(body: CardHeartbeatRequest): Promise<{ lock: Lock | null }> {
    return this.request("POST", "/heartbeat", CardHeartbeatRequestSchema.parse(body), LockResponseSchema);
  }

  cardHandoff(body: CardHandoffRequest): Promise<{ handedOff: true }> {
    return this.request("POST", "/handoff", CardHandoffRequestSchema.parse(body), HandoffResponseSchema);
  }

  trackLog(body: TrackLogRequest): Promise<{ logged: true }> {
    return this.request("POST", "/log", TrackLogRequestSchema.parse(body), LogResponseSchema);
  }

  prLink(body: LinkPrRequest): Promise<{ card: Card }> {
    return this.request("POST", "/pr", LinkPrRequestSchema.parse(body), PrResponseSchema);
  }
}
