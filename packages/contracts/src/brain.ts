import { z } from 'zod';

/**
 * Brain contracts for MergeMate's "agent board" product.
 * Exact spec in the internal plan (MM-115a contracts section).
 * The API and the MCP server implement exactly this.
 */

// ============================================================================
// Enums
// ============================================================================

export const PrioritySchema = z.enum(['P0', 'P1', 'P2']);
export type Priority = z.infer<typeof PrioritySchema>;

export const CardStatusSchema = z.enum(['open', 'active', 'review', 'merged', 'blocked']);
export type CardStatus = z.infer<typeof CardStatusSchema>;

export const ToolSchema = z.enum(['codex', 'copilot', 'muse', 'claude', 'mergemate', 'other']);
export type Tool = z.infer<typeof ToolSchema>;

export const TrackEventKindSchema = z.enum([
  'lock',
  'unlock',
  'heartbeat',
  'handoff',
  'pr_opened',
  'validation',
  'verified',
  'merged',
  'deploy',
  'note',
]);
export type TrackEventKind = z.infer<typeof TrackEventKindSchema>;

// ============================================================================
// Project
// ============================================================================

export const ProjectSchema = z.object({
  /** Unique project ID (typically GitHub repo owner/name, e.g. 'dominquecox/mergemate'). */
  id: z.string().min(1).max(256),
  /** GitHub repository owner. */
  owner: z.string().min(1).max(128),
  /** GitHub repository name. */
  repo: z.string().min(1).max(128),
  /** Per-project rules and instructions (e.g., branch patterns, gates, deploy line). */
  rules: z.string().min(1).max(20480),
  /** When project was created (ISO 8601). */
  createdAt: z.string().datetime(),
}).strict();
export type Project = z.infer<typeof ProjectSchema>;

// ============================================================================
// Lock
// ============================================================================

export const LockSchema = z.object({
  /** Card ID this lock holds. */
  cardId: z.string().min(1).max(64),
  /** Agent holding the lock (e.g. 'copilot'). */
  agent: z.string().min(1).max(60),
  /** Tool/seat identifier. */
  tool: ToolSchema,
  /** Timestamp when lock was acquired (ISO 8601). */
  since: z.string().datetime(),
  /** When lock expires (ISO 8601); renewed by heartbeat. */
  expiresAt: z.string().datetime(),
}).strict();
export type Lock = z.infer<typeof LockSchema>;

// ============================================================================
// Handoff
// ============================================================================

export const HandoffSchema = z.object({
  /** Card ID this handoff is for. */
  cardId: z.string().min(1).max(64),
  /** Agent that stopped work. */
  agent: z.string().min(1).max(60),
  /** Text describing where work stopped (≤2k). */
  stoppedAt: z.string().min(1).max(2048),
  /** Git branch where work was left (optional). */
  branch: z.string().min(1).max(256).optional(),
  /** Exact git head SHA where work was left (optional). */
  head: z.string().regex(/^[0-9a-f]{40}$/).optional(),
  /** Next step for the next agent (≤2k). */
  next: z.string().min(1).max(2048),
  /** When handoff occurred (ISO 8601). */
  at: z.string().datetime(),
}).strict();
export type Handoff = z.infer<typeof HandoffSchema>;

// ============================================================================
// Card
// ============================================================================

export const CardSchema = z.object({
  /** Unique card ID (e.g. 'MM-117'). */
  id: z.string().min(1).max(64),
  /** Project this card belongs to. */
  projectId: z.string().min(1).max(256),
  /** Position in the board queue (int, 0-based). */
  position: z.number().int().nonnegative(),
  /** Card title (≤160 chars). */
  title: z.string().min(1).max(160),
  /** Detailed description / acceptance criteria (≤20k). */
  details: z.string().min(1).max(20480),
  /** Priority level. */
  priority: PrioritySchema,
  /** Current status. */
  status: CardStatusSchema,
  /** Done-when criteria (≤2k). */
  doneWhen: z.string().min(1).max(2048),
  /** Git branch name (optional, set after work starts). */
  branch: z.string().min(1).max(256).optional(),
  /** GitHub PR number (optional, set after PR is opened). */
  prNumber: z.number().int().positive().optional(),
  /** Exact git head SHA of the PR (optional). */
  head: z.string().regex(/^[0-9a-f]{40}$/).optional(),
  /** When card was last updated (ISO 8601). */
  updatedAt: z.string().datetime(),
}).strict();
export type Card = z.infer<typeof CardSchema>;

// ============================================================================
// TrackEvent
// ============================================================================

export const TrackEventSchema = z.object({
  /** Unique event ID (UUID or nanoid). */
  id: z.string().min(1).max(64),
  /** Project this event belongs to. */
  projectId: z.string().min(1).max(256),
  /** Card ID this event relates to (optional). */
  cardId: z.string().min(1).max(64).optional(),
  /** Event kind. */
  kind: TrackEventKindSchema,
  /** Actor who triggered the event (agent or system). */
  actor: z.string().min(1).max(128),
  /** Event description / details (≤4k). */
  text: z.string().min(1).max(4096),
  /** When event occurred (ISO 8601). */
  at: z.string().datetime(),
}).strict();
export type TrackEvent = z.infer<typeof TrackEventSchema>;

// ============================================================================
// Agent Token (never includes hash/secret in responses)
// ============================================================================

export const AgentTokenSchema = z.object({
  /** Unique token ID. */
  id: z.string().min(1).max(64),
  /** Project this token is scoped to. */
  projectId: z.string().min(1).max(256),
  /** Token name/label (e.g. 'Agent A token'). */
  name: z.string().min(1).max(128),
  /** Tool/agent this token belongs to. */
  tool: ToolSchema,
  /** When token was created (ISO 8601). */
  createdAt: z.string().datetime(),
  /** When token was last used (ISO 8601, optional). */
  lastUsedAt: z.string().datetime().optional(),
}).strict();
export type AgentToken = z.infer<typeof AgentTokenSchema>;

// ============================================================================
// Request Schemas
// ============================================================================

/**
 * POST /brain/card-create
 * Request to create a new card.
 */
export const CreateCardRequestSchema = z.object({
  projectId: z.string().min(1).max(256),
  title: z.string().min(1).max(160),
  details: z.string().min(1).max(20480),
  priority: PrioritySchema,
  doneWhen: z.string().min(1).max(2048),
}).strict();
export type CreateCardRequest = z.infer<typeof CreateCardRequestSchema>;

/**
 * POST /brain/card-update
 * Request to update a card's fields.
 */
export const UpdateCardRequestSchema = z.object({
  projectId: z.string().min(1).max(256),
  cardId: z.string().min(1).max(64),
  title: z.string().min(1).max(160).optional(),
  details: z.string().min(1).max(20480).optional(),
  priority: PrioritySchema.optional(),
  doneWhen: z.string().min(1).max(2048).optional(),
  status: CardStatusSchema.optional(),
}).strict();
export type UpdateCardRequest = z.infer<typeof UpdateCardRequestSchema>;

/**
 * POST /brain/card-reorder
 * Request to reorder cards in the board.
 */
export const ReorderCardRequestSchema = z.object({
  projectId: z.string().min(1).max(256),
  cardId: z.string().min(1).max(64),
  newPosition: z.number().int().nonnegative(),
}).strict();
export type ReorderCardRequest = z.infer<typeof ReorderCardRequestSchema>;

/**
 * POST /brain/card-lock
 * Request to lock a card for an agent.
 */
export const CardLockRequestSchema = z.object({
  projectId: z.string().min(1).max(256),
  cardId: z.string().min(1).max(64),
  agent: z.string().min(1).max(60),
  tool: ToolSchema,
  ttlSeconds: z.number().int().positive().max(3600),
}).strict();
export type CardLockRequest = z.infer<typeof CardLockRequestSchema>;

/**
 * POST /brain/card-heartbeat
 * Request to renew a lock's TTL.
 */
export const CardHeartbeatRequestSchema = z.object({
  projectId: z.string().min(1).max(256),
  cardId: z.string().min(1).max(64),
  agent: z.string().min(1).max(60),
  tool: ToolSchema,
}).strict();
export type CardHeartbeatRequest = z.infer<typeof CardHeartbeatRequestSchema>;

/**
 * POST /brain/card-handoff
 * Request to record a handoff and unlock a card.
 */
export const CardHandoffRequestSchema = z.object({
  projectId: z.string().min(1).max(256),
  cardId: z.string().min(1).max(64),
  agent: z.string().min(1).max(60),
  stoppedAt: z.string().min(1).max(2048),
  branch: z.string().min(1).max(256).optional(),
  head: z.string().regex(/^[0-9a-f]{40}$/).optional(),
  next: z.string().min(1).max(2048),
}).strict();
export type CardHandoffRequest = z.infer<typeof CardHandoffRequestSchema>;

/**
 * POST /brain/track-log
 * Request to append an event to the track log.
 * Server-only kinds (merged, verified, deploy) are rejected for client logs.
 */
export const TrackLogRequestSchema = z.object({
  projectId: z.string().min(1).max(256),
  cardId: z.string().min(1).max(64).optional(),
  kind: TrackEventKindSchema,
  actor: z.string().min(1).max(128),
  text: z.string().min(1).max(4096),
}).strict();
export type TrackLogRequest = z.infer<typeof TrackLogRequestSchema>;

/**
 * POST /brain/pr-link
 * Request to link a GitHub PR to a card.
 */
export const LinkPrRequestSchema = z.object({
  projectId: z.string().min(1).max(256),
  cardId: z.string().min(1).max(64),
  prNumber: z.number().int().positive(),
  head: z.string().regex(/^[0-9a-f]{40}$/),
}).strict();
export type LinkPrRequest = z.infer<typeof LinkPrRequestSchema>;

/**
 * POST /brain/proceed-with-track
 * Request to get the top unlocked card and lock it for the agent.
 * The server derives agent and tool from the agent token, not the request body.
 */
export const ProceedWithTrackRequestSchema = z.object({
  projectId: z.string().min(1).max(256),
}).strict();
export type ProceedWithTrackRequest = z.infer<typeof ProceedWithTrackRequestSchema>;

// ============================================================================
// Response Schemas
// ============================================================================

/**
 * POST /brain/proceed-with-track
 * Response: the top unlocked card, current lock, rules, limited board context, and track tail.
 */
export const ProceedWithTrackResponseSchema = z.object({
  /** The card to work on. */
  card: CardSchema,
  /** Current lock on the card. */
  lock: LockSchema,
  /** Project rules (≤20k). */
  rules: z.string().min(1).max(20480),
  /** Top 20 cards from the board (for context). */
  boardTop: z.array(CardSchema).max(20),
  /** Last 50 track events (for context). */
  trackTail: z.array(TrackEventSchema).max(50),
}).strict();
export type ProceedWithTrackResponse = z.infer<typeof ProceedWithTrackResponseSchema>;

/**
 * POST /v1/brain/projects/:id/run (owner, brain flag)
 * Runs an agent on the card the owner holds after Proceed. The agent prepares a patch from the repository
 * files; the owner approves that exact patch with a passkey (open `/workflows?run=<runId>`), and then a DRAFT
 * pull request opens on a new branch. Merging stays human. While the run works,
 * `status` is "running" with `runId`; the card's branch is `mergemate-agent/<runId>` and its PR number
 * appears on the board when the draft opens.
 */
export const BrainRunStatusSchema = z.enum(['running', 'pr_opened', 'no_change', 'failed']);
export const BrainRunResponseSchema = z.object({
  status: BrainRunStatusSchema,
  card: CardSchema,
  summary: z.string().max(2000),
  files: z.array(z.string().min(1).max(240)).max(8),
  runId: z.string().min(1).max(100).optional(),
  branch: z.string().min(1).max(256).optional(),
  prNumber: z.number().int().positive().optional(),
  prUrl: z.string().url().max(400).refine((value) => value.startsWith('https://'), 'https only').optional(),
  message: z.string().max(2000).optional(),
}).strict();
export type BrainRunStatus = z.infer<typeof BrainRunStatusSchema>;
export type BrainRunResponse = z.infer<typeof BrainRunResponseSchema>;
