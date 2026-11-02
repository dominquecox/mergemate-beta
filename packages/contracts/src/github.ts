import { z } from "zod";
import { IsoDateTime, pageOf, RiskLevel } from "./common";

export const NotificationFilter = z.enum(["all", "review", "mentions", "mine"]);
export type NotificationFilter = z.infer<typeof NotificationFilter>;

export const NotificationKind = z.enum(["review", "mention", "mine"]);
export type NotificationKind = z.infer<typeof NotificationKind>;

export const PrStatus = z.enum(["open", "draft", "merged", "closed"]);
export type PrStatus = z.infer<typeof PrStatus>;

export const Notification = z.object({
  /** Opaque id; use it as-is in notification paths. */
  id: z.string(),
  kind: NotificationKind,
  /** Repository full name, `owner/repo`. */
  repo: z.string(),
  number: z.number().int().positive(),
  title: z.string(),
  /** GitHub login of the pull request author. */
  author: z.string(),
  actor: z.string().nullable().optional(),
  event: z.string().optional(),
  status: PrStatus.nullable(),
  risk: RiskLevel.optional(),
  summaryLine: z.string().optional(),
  updatedAt: IsoDateTime,
  read: z.boolean(),
  stateToken:z.uuid().nullable().optional(),
});
export type Notification = z.infer<typeof Notification>;

export const NotificationPage = pageOf(Notification).extend({serverTime:IsoDateTime.optional(),refreshAt:IsoDateTime.nullable().optional()});
export type NotificationPage = z.infer<typeof NotificationPage>;

export const SnoozeRequest = z.object({
  until: IsoDateTime,
});
export type SnoozeRequest = z.infer<typeof SnoozeRequest>;

export const Repo = z.object({
  id: z.string(),
  fullName: z.string(),
  private: z.boolean(),
  watching: z.boolean(),
});
export type Repo = z.infer<typeof Repo>;

export const RepoPage = pageOf(Repo);
export type RepoPage = z.infer<typeof RepoPage>;

export const RepoWatchRequest = z.object({
  watching: z.boolean(),
});
export type RepoWatchRequest = z.infer<typeof RepoWatchRequest>;

export const InstallationStatus = z.enum(["active", "pending_approval", "suspended"]);
export type InstallationStatus = z.infer<typeof InstallationStatus>;

export const Installation = z.object({
  id: z.string(),
  account: z.string(),
  accountType: z.enum(["User", "Organization"]),
  status: InstallationStatus,
  /** Where the user manages which repositories MergeMate can see. */
  manageUrl: z.url(),
});
export type Installation = z.infer<typeof Installation>;

export const InstallationList = z.object({
  items: z.array(Installation),
  /** Install MergeMate on another account or organization. */
  installUrl: z.url(),
});
export type InstallationList = z.infer<typeof InstallationList>;

export const CheckState = z.enum(["queued", "in_progress", "success", "failure", "neutral", "skipped", "cancelled"]);
export type CheckState = z.infer<typeof CheckState>;

export const PrFile = z.object({
  path: z.string(),
  status: z.string(),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  /** Unified diff for this file; absent for binary or very large files. */
  patch: z.string().optional(),
  previousPath:z.string().optional(),
  patchState:z.enum(["available","partial","unavailable"]).optional(),
});
export type PrFile = z.infer<typeof PrFile>;

export const PrCheck = z.object({
  id:z.string().optional(),
  name: z.string(),
  state: CheckState,
  url: z.url().optional(),
});
export type PrCheck = z.infer<typeof PrCheck>;

export const PrComment = z.object({
  id: z.string(),
  author: z.string(),
  body: z.string(),
  createdAt: IsoDateTime,
});
export type PrComment = z.infer<typeof PrComment>;

export const PrThread = z.object({
  kind:z.enum(["review","conversation","review-summary"]).optional(),
  reviewState:z.string().optional(),
  outdated:z.boolean().optional(),
  id: z.string(),
  /** File path for review threads; null for the main conversation. */
  path: z.string().nullable(),
  line: z.number().int().nullable(),
  comments: z.array(PrComment),
});
export type PrThread = z.infer<typeof PrThread>;

/**
 * GitHub's merge status for an open pull request. `unknown` means GitHub is still computing it
 * (refetch shortly); it is never shown as ready. Read-only: MergeMate never merges or resolves.
 */
export const MergeState = z.enum(["clean", "conflicts", "blocked", "behind", "unstable", "unknown"]);
export type MergeState = z.infer<typeof MergeState>;

export const PrDetail = z.object({
  repo: z.string(),
  number: z.number().int().positive(),
  title: z.string(),
  body: z.string(),
  author: z.string(),
  status: PrStatus,
  baseBranch: z.string(),
  headBranch: z.string(),
  headSha: z.string(),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  changedFiles: z.number().int().nonnegative(),
  /** Files listed here; `changedFiles` is the full count. */
  files: z.array(PrFile),
  checks: z.array(PrCheck),
  checkCursor:z.string().nullable().optional(),
  threads: z.array(PrThread),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  htmlUrl: z.url(),
  /** Present for open pull requests only. */
  mergeState: MergeState.optional(),
});
export type PrDetail = z.infer<typeof PrDetail>;

export const ActivityEvent = z.enum(["opened", "updated", "review", "comment", "checks", "closed"]);
export type ActivityEvent = z.infer<typeof ActivityEvent>;

/** A pull request that changed on GitHub since the client's last poll. Refetch it to see what changed. */
export const ActivityItem = z.object({
  repo: z.string(),
  number: z.number().int().positive(),
  event: ActivityEvent,
  updatedAt: IsoDateTime,
});
export type ActivityItem = z.infer<typeof ActivityItem>;

export const ActivityResponse = z.object({
  items: z.array(ActivityItem),
  /** Pass as `since` on the next poll. */
  serverTime: IsoDateTime,
});
export type ActivityResponse = z.infer<typeof ActivityResponse>;

export const InboxPreference=z.object({filter:NotificationFilter}).strict();
export const InboxMutation=z.object({operationId:z.uuid(),expectedOperationId:z.uuid().nullable(),action:z.enum(['done','snooze','restore']),observedUpdatedAt:IsoDateTime,durationMinutes:z.number().int().min(1).max(525600).optional()}).strict().refine(value=>value.action==='snooze'?value.durationMinutes!==undefined:value.durationMinutes===undefined);
export type InboxMutation=z.infer<typeof InboxMutation>;
export const InboxReceipt=z.object({operationId:z.uuid(),doneAt:IsoDateTime.nullable(),snoozedUntil:IsoDateTime.nullable(),updatedAt:IsoDateTime});
export type InboxReceipt=z.infer<typeof InboxReceipt>;

export const InboxUndo=z.object({itemId:z.string(),receipt:InboxReceipt}).nullable();
export type InboxUndo=z.infer<typeof InboxUndo>;
