/**
 * MM-120: proposal validation for the agent runtime.
 *
 * A model-produced proposal is accepted only when it is bounded, addresses
 * repo-relative files, and carries no secret-shaped content. Rejected
 * proposals never reach the approval-gated draft path.
 */
import { ApiError } from "../../errors";
import type { ProposedChange, WorkProposal } from "./types";

export const MAX_FILES = 8;
export const MAX_PATCH_BYTES = 131_072;
export const MAX_SUMMARY_CHARS = 280;
export const MAX_NOTE_CHARS = 2_000;
export const MAX_PATH_CHARS = 240;
export const MAX_FILE_BYTES = 20_000;

/** Same source-tree boundary the configured executor enforces for patches. */
const permittedSource = (path: string): boolean =>
  /^(?:apps\/(?:mobile|web)\/(?:src|app|test)|packages\/contracts\/(?:src|test))\/[a-zA-Z\d_./()[\]-]+\.(?:[cm]?[jt]sx?|css|md)$/.test(path) &&
  !path.split("/").some((x) => !x || x === "." || x === "..") &&
  !/(?:^|\/)(?:\.git(?:hub)?|\.mergemate|auth|oauth|session|billing|migrations?|secrets?|credentials?|deploy(?:ment)?s?)(?:\/|[._-]|$)|AuthContext|(?:auth|oauth|session|token|secret|credential|wrangler|package(?:-lock)?|app\.config|tsconfig|eas|dockerfile|compose\.ya?ml)\./i.test(path);

const SECRET_SHAPE =
  /(sk[-_]live[-_]|rk_live_|sk_test_|rk_test_|ghp_[A-Za-z\d]{20,}|github_pat_|xox[bpas]-|-----BEGIN [A-Z ]*PRIVATE KEY-----|AIza[0-9A-Za-z_-]{20,}|AKIA[0-9A-Z]{10,})/;

/** True when text contains a credential-shaped value. */
export const hasSecretShape = (text: string): boolean => SECRET_SHAPE.test(text);

const invalid = (message: string, logDetail?: string): ApiError =>
  new ApiError("validation_failed", message, {}, logDetail);

export const parseProposal = (text: string): WorkProposal => {
  let data: unknown;
  try {
    data = JSON.parse(text) as unknown;
  } catch {
    throw invalid("The agent did not return a usable proposal.");
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw invalid("The agent did not return a usable proposal.");
  }
  const record = data as Record<string, unknown>;
  const changes = record["changes"];
  if (typeof record["summary"] !== "string" || typeof record["note"] !== "string" ||
    typeof record["noChange"] !== "boolean" || !Array.isArray(changes)) {
    throw invalid("The agent did not return a usable proposal.");
  }
  for (const change of changes) {
    if (typeof change !== "object" || change === null || Array.isArray(change)) {
      throw invalid("The agent did not return a usable proposal.");
    }
    const item = change as Record<string, unknown>;
    if (typeof item["path"] !== "string" || typeof item["content"] !== "string") {
      throw invalid("The agent did not return a usable proposal.");
    }
  }
  return {
    summary: record["summary"] as string,
    changes: changes as ProposedChange[],
    noChange: record["noChange"] as boolean,
    note: record["note"] as string,
  };
};

export const validateProposal = (proposal: WorkProposal): WorkProposal => {
  if (!proposal.summary.trim() || proposal.summary.length > MAX_SUMMARY_CHARS) {
    throw invalid("Proposal summary must be 1-280 characters.");
  }
  if (proposal.note.length > MAX_NOTE_CHARS) throw invalid("Proposal note is too long.");
  if (proposal.noChange) {
    if (proposal.changes.length > 0) throw invalid("A no-change proposal must not list files.");
    return proposal;
  }
  if (proposal.changes.length < 1 || proposal.changes.length > MAX_FILES) {
    throw invalid(`Proposals change 1-${MAX_FILES} files.`);
  }
  let bytes = 0;
  for (const change of proposal.changes) {
    if (!change.path || change.path.length > MAX_PATH_CHARS) throw invalid(`Bad proposal path: ${change.path.slice(0, 80)}`);
    if (!permittedSource(change.path)) throw invalid(`Proposal path is outside the patch boundary: ${change.path.slice(0, 80)}`);
    if (change.content.length > MAX_FILE_BYTES) throw invalid(`Proposal file is too large: ${change.path.slice(0, 80)}`);
    if (SECRET_SHAPE.test(change.content) || SECRET_SHAPE.test(change.path)) {
      throw invalid("Proposal carries secret-shaped content.", `secret-shaped proposal at ${change.path.slice(0, 80)}`);
    }
    bytes += change.content.length;
  }
  if (bytes > MAX_PATCH_BYTES) throw invalid("Proposal patch is too large.");
  return proposal;
};
