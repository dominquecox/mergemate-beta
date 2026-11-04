/**
 * MM-120: agent runtime types over the merged brain API.
 *
 * Cards, locks, events and the proceed response are the shared
 * `@mergemate/contracts` brain schemas (MM-115a), so the runtime agrees with
 * the API on every bound. Agent, tool and actor always come from the
 * per-agent token on the server, never from runtime inputs.
 */
import type {
  Card,
  CardHandoffRequest,
  Lock,
  ProceedWithTrackResponse,
  Tool,
  TrackEvent,
} from "@mergemate/contracts";

export type { Card, CardHandoffRequest, Lock, ProceedWithTrackResponse, Tool, TrackEvent };

/** What the runtime needs from the MM-115 brain agent API. */
export interface BrainApi {
  /**
   * Takes the top free card for this token's project and locks it.
   * Agent and tool are derived from the token server-side; the request
   * carries only the project id.
   */
  proceedWithTrack: (projectId: string) => Promise<ProceedWithTrackResponse>;
  /**
   * Records a handoff and releases the caller's lock. The request carries
   * the project id (per the shared handoff schema); `at` is client-observed
   * because the server answers `{ handedOff: true }` with no timestamp.
   */
  writeHandoff: (handoff: CardHandoffRequest) => Promise<{ at: string }>;
}

/** What the runtime needs from the model router. */
export interface ModelPort {
  complete: (input: { system: string; prompt: string; maxOutputTokens: number }) => Promise<{ text: string }>;
}

/** One file change proposed by the agent for the card. */
export interface ProposedChange {
  path: string;
  content: string;
}

export interface WorkProposal {
  summary: string;
  changes: ProposedChange[];
  /** True when the card needs no code change (note-only outcome). */
  noChange: boolean;
  note: string;
}
