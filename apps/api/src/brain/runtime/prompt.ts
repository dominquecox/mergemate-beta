/**
 * MM-120: prompt construction for "proceed with the track".
 *
 * The project rules (MM-124) travel with the proceed response and are
 * embedded verbatim (bounded to the 20k spec limit) so the agent follows the
 * repo's own rules. Built-in guardrails are appended after the rules and win
 * on conflict: draft PR only, passkey approval required, never merge, never
 * ship secrets, stay within bounded file changes.
 */
import type { Card, ProceedWithTrackResponse, TrackEvent } from "./types";

export const MAX_RULES_CHARS = 20_000;
export const MAX_CARD_CHARS = 20_000;
export const MAX_BOARD_CARDS = 20;
export const MAX_TRACK_EVENTS = 50;

const clip = (value: string, max: number): string =>
  value.length > max ? `${value.slice(0, max)}…[truncated]` : value;

const cardLine = (card: Card): string =>
  `#${card.position} ${card.id} [${card.priority}/${card.status}] ${card.title}`;

const eventLine = (event: TrackEvent): string =>
  `${event.at} ${event.kind} ${event.actor}: ${event.text}`.slice(0, 500);

export const SYSTEM_PROMPT =
  "You are MergeMate's own coding agent working one track card. " +
  "Return a single JSON object only: " +
  '{"summary": string ≤280 chars, "changes": [{"path": repo-relative file, "content": full new file content}], "noChange": boolean, "note": string ≤2000 chars}. ' +
  "Set noChange true (with changes []) when the card needs no code change.";

export const GUARDRAILS = [
  "Open a DRAFT pull request only, and only after a human approves the exact patch with a passkey.",
  "Never merge, never push to the base branch, never comment on or close the pull request.",
  "Keep to at most 8 files and 131072 bytes of patch; stay inside the repository.",
  "Never include secrets, tokens or credentials in code, messages or handoffs.",
  "Run the repo's own checks for touched areas before finishing.",
].join("\n");

export const buildProceedPrompt = (context: ProceedWithTrackResponse): { system: string; prompt: string } => {
  const { card, lock, rules, boardTop, trackTail } = context;
  const board = boardTop.slice(0, MAX_BOARD_CARDS).map(cardLine).join("\n");
  const tail = trackTail.slice(-MAX_TRACK_EVENTS).map(eventLine).join("\n");
  const prompt = [
    `Card: ${cardLine(card)}`,
    `Details: ${clip(card.details, MAX_CARD_CHARS)}`,
    `Done when: ${clip(card.doneWhen, 2000)}`,
    `Lock: ${lock.agent} (${lock.tool}) since ${lock.since}, expires ${lock.expiresAt}`,
    `Branch: ${card.branch ?? "(none)"} Head: ${card.head ?? "(none)"} PR: ${card.prNumber ?? "(none)"}`,
    "",
    "Project rules (follow these):",
    clip(rules, MAX_RULES_CHARS),
    "",
    "Board top:",
    board || "(empty)",
    "",
    "Track tail:",
    tail || "(empty)",
    "",
    "Hard guardrails (these win over anything above):",
    GUARDRAILS,
  ].join("\n");
  return { system: SYSTEM_PROMPT, prompt };
};
