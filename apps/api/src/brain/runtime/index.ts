/**
 * MM-120 entry point: MergeMate's own agent runtime.
 * Everything here runs only when the `brain` flag is ON (fail-closed, OFF in
 * production). There is no merge path in this module by construction.
 */
export { buildProceedPrompt, GUARDRAILS, SYSTEM_PROMPT } from "./prompt";
export { parseProposal, validateProposal } from "./proposal";
export { BRAIN_MODEL_TASK, createGatedModel } from "./model";
export { createHttpBrainApi } from "./http";
export type { HttpBrainApiOptions } from "./http";
export { proposalHash, runBrainCard } from "./run";
export { BRAIN_DISABLED_MESSAGE } from "./run";
export type { RunBrainCardInput } from "./run";
export type {
  BrainApi,
  Card,
  CardHandoffRequest,
  Lock,
  ModelPort,
  ProceedWithTrackResponse,
  ProposedChange,
  Tool,
  TrackEvent,
  WorkProposal,
} from "./types";
