/**
 * MM-120: HTTP adapter from the agent runtime to the merged brain agent API.
 *
 * Speaks the `POST /agent/v1/brain/{proceed,handoff,log,pr}` routes from the
 * agent token's project scope: the token travels in the Authorization header
 * (never in logs), and agent/tool identity is derived from it server-side,
 * so `proceedWithTrack` sends only the project id. Responses are parsed with
 * the shared `@mergemate/contracts` schemas; anything else is refused.
 */
import {
  CardHandoffRequestSchema,
  ProceedWithTrackResponseSchema,
  type CardHandoffRequest,
  type ProceedWithTrackResponse,
} from "@mergemate/contracts";
import { ApiError } from "../../errors";
import type { BrainApi } from "./types";

export interface HttpBrainApiOptions {
  /** Agent-route root, e.g. `https://api.mergemate.dev/agent/v1/brain`. */
  baseUrl: string;
  /** Per-project `mmb_…` agent token. Held in memory, sent as a bearer. */
  token: string;
  fetchImpl?: typeof fetch | undefined;
}

export const createHttpBrainApi = (options: HttpBrainApiOptions): BrainApi => {
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;
  const post = async (path: string, body: unknown): Promise<unknown> => {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method: "POST",
        headers: { authorization: `Bearer ${options.token}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      throw new ApiError("upstream_unavailable", "The brain API is unreachable.");
    }
    if (response.status === 401 || response.status === 403) {
      throw new ApiError("forbidden", "The brain agent token was rejected.");
    }
    if (!response.ok) throw new ApiError("upstream_unavailable", "The brain API request failed.");
    try {
      return (await response.json()) as unknown;
    } catch {
      throw new ApiError("upstream_unavailable", "The brain API returned an unusable answer.");
    }
  };
  return {
    proceedWithTrack: async (projectId: string): Promise<ProceedWithTrackResponse> => {
      const parsed = ProceedWithTrackResponseSchema.safeParse(await post("/proceed", { projectId }));
      if (!parsed.success) throw new ApiError("upstream_unavailable", "The brain API returned an unusable answer.");
      return parsed.data;
    },
    writeHandoff: async (handoff: CardHandoffRequest): Promise<{ at: string }> => {
      if (!CardHandoffRequestSchema.safeParse(handoff).success) {
        throw new ApiError("validation_failed", "The handoff does not match the brain contract.");
      }
      const done = (await post("/handoff", handoff)) as { handedOff?: unknown };
      if (done?.handedOff !== true) throw new ApiError("upstream_unavailable", "The brain API did not record the handoff.");
      return { at: new Date().toISOString() };
    },
  };
};
