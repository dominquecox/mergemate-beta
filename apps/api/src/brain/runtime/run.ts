/**
 * MM-120: MergeMate's own agent runtime ("proceed with the track").
 *
 * Flow: brain flag on → proceed (card + lock + rules + context) → plan the
 * card through the model router → validate the proposal → write the handoff.
 * The runtime never merges and never publishes. It stops at a validated
 * proposal and its hash; a draft PR is only ever opened by the existing
 * workflow executor, after that executor's own stored, single-use passkey
 * approval for the exact patch. No caller-built approval is accepted here.
 */
import { ApiError } from "../../errors";
import type { Env } from "../../env";
import { sha256Hex } from "../../lib/crypto";
import { brainEnabled } from "../flag";
import { buildProceedPrompt } from "./prompt";
import { parseProposal, validateProposal } from "./proposal";
import type {
  BrainApi,
  ModelPort,
  ProceedWithTrackResponse,
  WorkProposal,
} from "./types";

export const BRAIN_DISABLED_MESSAGE = "The brain runtime is disabled.";

export interface RunBrainCardInput {
  env: Env;
  api: BrainApi;
  model: ModelPort;
  projectId: string;
  /** Agent display name. Identity is enforced from the token server-side. */
  agent: string;
  now?: () => Date;
}

export interface BrainCardOutcome {
  context: ProceedWithTrackResponse;
  proposal: WorkProposal;
  /** Exact proposal hash the passkey approval must bind to. */
  patchHash: string;
  handoffAt: string;
}

const canonicalProposal = (proposal: WorkProposal): string =>
  JSON.stringify({
    summary: proposal.summary,
    changes: [...proposal.changes]
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
      .map((change) => ({ path: change.path, content: change.content })),
    noChange: proposal.noChange,
    note: proposal.note,
  });

export const proposalHash = async (proposal: WorkProposal): Promise<string> =>
  sha256Hex(canonicalProposal(proposal));

const handoffFor = (outcome: { proposal: WorkProposal; patchHash: string }): { stoppedAt: string; next: string } =>
  outcome.proposal.noChange
    ? {
      stoppedAt: "plan complete: no code change needed",
      next: `No patch proposed (${outcome.proposal.summary}). Next: reviewer confirms, then card to review.`,
    }
    : {
      stoppedAt: "plan complete: proposal ready for human passkey approval",
      next: `Proposal ${outcome.patchHash.slice(0, 12)} awaits passkey approval, then the executor opens a DRAFT PR. Never merge from the runtime.`,
    };

export const runBrainCard = async (input: RunBrainCardInput): Promise<BrainCardOutcome> => {
  if (!(await brainEnabled(input.env))) {
    throw new ApiError("forbidden", BRAIN_DISABLED_MESSAGE);
  }
  const context = await input.api.proceedWithTrack(input.projectId);
  const { system, prompt } = buildProceedPrompt(context);
  const { text } = await input.model.complete({ system, prompt, maxOutputTokens: 8192 });
  const proposal = validateProposal(parseProposal(text));
  const patchHash = await proposalHash(proposal);
  const handoff = handoffFor({ proposal, patchHash });
  const { at } = await input.api.writeHandoff({
    projectId: input.projectId,
    cardId: context.card.id,
    agent: input.agent,
    stoppedAt: handoff.stoppedAt,
    ...(context.card.branch === undefined ? {} : { branch: context.card.branch }),
    ...(context.card.head === undefined ? {} : { head: context.card.head }),
    next: handoff.next,
  });
  return { context, proposal, patchHash, handoffAt: at };
};
