/**
 * MM-119: MCP tool definitions and dispatch for the brain agent API.
 *
 * Seven tools, one per agent action: `board_read`,
 * `proceed_with_track`, `card_lock`, `card_heartbeat`, `card_handoff`,
 * `track_log`, `pr_link`. Arguments are validated with the shared
 * `@mergemate/contracts` request schemas, so client and server agree on
 * every bound; the server additionally derives agent, tool and actor from
 * the token. Only `note` and `pr_opened` are client-loggable event kinds.
 */
import {
  TrackEventKindSchema,
  type CardHandoffRequest,
  type CardHeartbeatRequest,
  type CardLockRequest,
  type LinkPrRequest,
  type TrackLogRequest,
} from "@mergemate/contracts";
import { BrainApiClient } from "./client.ts";

export type BrainToolName =
  | "board_read"
  | "proceed_with_track"
  | "card_lock"
  | "card_heartbeat"
  | "card_handoff"
  | "track_log"
  | "pr_link";

export interface ToolDefinition {
  name: BrainToolName;
  description: string;
  inputSchema: Record<string, unknown>;
}

const str = (description: string, maxLength: number): Record<string, unknown> => ({
  type: "string",
  description,
  maxLength,
});

const CLIENT_TOOL_ENUM = ["codex", "copilot", "muse", "claude", "mergemate", "other"] as const;

const toolArg = {
  type: "string",
  description: "Agent tool (must match the token's tool).",
  enum: [...CLIENT_TOOL_ENUM],
};

const required = (...names: string[]): Record<string, unknown> => ({ required: names });

export const TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  {
    name: "board_read",
    description: "Read the project board for this token's project: project, ordered cards and the track tail. Takes no arguments.",
    inputSchema: { type: "object", properties: {}, ...required() },
  },
  {
    name: "proceed_with_track",
    description: "Proceed with the track: returns the top unlocked card with full context (card, lock, rules, board top, track tail) and locks it for the caller.",
    inputSchema: {
      type: "object",
      properties: { projectId: str("Brain project id, as returned by board_read.", 256) },
      ...required("projectId"),
    },
  },
  {
    name: "card_lock",
    description: "Lock a card for the calling agent. One lock per agent; expired locks free themselves.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: str("Brain project id.", 256),
        cardId: str("Card id to lock.", 64),
        agent: str("Agent name holding the lock.", 60),
        tool: toolArg,
        ttlSeconds: { type: "integer", description: "Lock TTL in seconds, at most 3600.", minimum: 1, maximum: 3600 },
      },
      ...required("projectId", "cardId", "agent", "tool", "ttlSeconds"),
    },
  },
  {
    name: "card_heartbeat",
    description: "Renew a card lock before it expires.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: str("Brain project id.", 256),
        cardId: str("Locked card id.", 64),
        agent: str("Agent name holding the lock.", 60),
        tool: toolArg,
      },
      ...required("projectId", "cardId", "agent", "tool"),
    },
  },
  {
    name: "card_handoff",
    description: "Release a card lock and record where the next agent continues (branch, head, next step).",
    inputSchema: {
      type: "object",
      properties: {
        projectId: str("Brain project id.", 256),
        cardId: str("Card id to hand off.", 64),
        agent: str("Agent name releasing the lock.", 60),
        stoppedAt: str("Why the agent stopped (limit, error, done).", 2048),
        branch: str("Branch with the agent's work, if any.", 256),
        head: str("Exact head SHA (40 lowercase hex) of the agent's work, if any.", 40),
        next: str("Next step for whoever continues.", 2048),
      },
      ...required("projectId", "cardId", "agent", "stoppedAt", "next"),
    },
  },
  {
    name: "track_log",
    description: "Append an event to the project track log. Only note and pr_opened are client-loggable.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: str("Brain project id.", 256),
        cardId: str("Related card id, if any.", 64),
        kind: { type: "string", description: "Event kind.", enum: ["note", "pr_opened"] },
        actor: str("Who logged the event.", 128),
        text: str("Event text.", 4096),
      },
      ...required("projectId", "kind", "actor", "text"),
    },
  },
  {
    name: "pr_link",
    description: "Link a pull request (number + head SHA) to a card.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: str("Brain project id.", 256),
        cardId: str("Card id.", 64),
        prNumber: { type: "integer", description: "Pull request number.", minimum: 1 },
        head: str("Exact head SHA (40 lowercase hex) of the PR.", 40),
      },
      ...required("projectId", "cardId", "prNumber", "head"),
    },
  },
];

/** Event kinds an agent may log itself; the server owns the rest. */
export const CLIENT_EVENT_KINDS: readonly string[] = ["note", "pr_opened"];

const check = (ok: boolean, message: string): void => {
  if (!ok) throw new Error(`invalid_tool_input: ${message}`);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Runs one tool call against the brain API client. Unknown tools and
 * contract-invalid input throw before any request is sent. Contract schemas
 * do the bound checks; this layer only rejects unknown tools and
 * server-owned event kinds early.
 */
export const dispatchTool = async (
  client: BrainApiClient,
  name: string,
  args: unknown,
): Promise<unknown> => {
  if (!isRecord(args)) throw new Error("invalid_tool_input: arguments must be an object");
  switch (name as BrainToolName) {
    case "board_read":
      return client.boardRead();
    case "proceed_with_track": {
      if (typeof args["projectId"] !== "string") throw new Error("invalid_tool_input: projectId is required");
      return client.proceedWithTrack(args["projectId"]);
    }
    case "card_lock":
      return client.cardLock(args as CardLockRequest);
    case "card_heartbeat":
      return client.cardHeartbeat(args as CardHeartbeatRequest);
    case "card_handoff":
      return client.cardHandoff(args as CardHandoffRequest);
    case "track_log": {
      const kind = (args as Record<string, unknown>)["kind"];
      check(typeof kind === "string" && (CLIENT_EVENT_KINDS as readonly string[]).includes(kind), "kind is not client-loggable");
      TrackEventKindSchema.parse(kind);
      return client.trackLog(args as TrackLogRequest);
    }
    case "pr_link":
      return client.prLink(args as LinkPrRequest);
    default:
      throw new Error(`unknown_tool: ${name}`);
  }
};
