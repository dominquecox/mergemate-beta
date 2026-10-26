import { z } from "zod";
import { IsoDateTime, pageOf, RiskLevel } from "./common";

export const NotificationFilter = z.enum(["all", "review", "mentions", "mine"]);
export type NotificationFilter = z.infer<typeof NotificationFilter>;

export const NotificationKind = z.enum(["review", "mention", "mine"]);
export type NotificationKind = z.infer<typeof NotificationKind>;

export const PrStatus = z.enum(["open", "draft", "merged", "closed"]);
export type PrStatus = z.infer<typeof PrStatus>;

export const Notification = z.object({
  id: z.string(),
  kind: NotificationKind,
  /** Repository full name, `owner/repo`. */
  repo: z.string(),
  title: z.string(),
  /** GitHub login of the pull request author. */
  author: z.string(),
  status: PrStatus,
  risk: RiskLevel.optional(),
  summaryLine: z.string().optional(),
  updatedAt: IsoDateTime,
  read: z.boolean(),
});
export type Notification = z.infer<typeof Notification>;

export const NotificationPage = pageOf(Notification);
export type NotificationPage = z.infer<typeof NotificationPage>;

export const SnoozeRequest = z.object({
  until: IsoDateTime,
});
export type SnoozeRequest = z.infer<typeof SnoozeRequest>;

export const Repo = z.object({
  id: z.string(),
  fullName: z.string(),
  watching: z.boolean(),
});
export type Repo = z.infer<typeof Repo>;

export const RepoPage = pageOf(Repo);
export type RepoPage = z.infer<typeof RepoPage>;
