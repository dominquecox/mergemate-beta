import {
  ErrorCode,
  ErrorBody,
  IsoDateTime,
  PrRef,
  RiskLevel,
  HealthResponse,
  User,
  Session,
  AuthStartRequest,
  AuthStartResponse,
  AuthCallbackRequest,
  AuthCallbackResponse,
  NotificationFilter,
  NotificationKind,
  PrStatus,
  Notification,
  NotificationPage,
  SnoozeRequest,
  Repo,
  RepoPage,
  AnalysisCoverage,
  PrSummary,
  PrRisk,
  TriageLane,
  TriageItem,
  TriageQueue,
  TriageChoice,
  Settings,
  QuietHours,
} from "@mergemate/contracts";

export {
  ErrorCode,
  ErrorBody,
  IsoDateTime,
  PrRef,
  RiskLevel,
  HealthResponse,
  User,
  Session,
  AuthStartRequest,
  AuthStartResponse,
  AuthCallbackRequest,
  AuthCallbackResponse,
  NotificationFilter,
  NotificationKind,
  PrStatus,
  Notification,
  NotificationPage,
  SnoozeRequest,
  Repo,
  RepoPage,
  AnalysisCoverage,
  PrSummary,
  PrRisk,
  TriageLane,
  TriageItem,
  TriageQueue,
  TriageChoice,
  Settings,
  QuietHours,
};

export type ThemeMode = "dark" | "light" | "system";

export interface SecretLeakWarning {
  file: string;
  line: number;
  maskedSnippet: string;
  rule: string;
}

export interface PrCheck {
  id: string;
  name: string;
  status: "completed" | "in_progress" | "queued";
  conclusion: "success" | "failure" | "neutral" | "pending";
}

export interface PrFile {
  filename: string;
  status: "added" | "modified" | "removed";
  additions: number;
  deletions: number;
  patchSnippet?: string;
}

export interface PrComment {
  id: string;
  author: string;
  avatarUrl: string;
  body: string;
  createdAt: string;
}

/** GitHub's merge status for an open pull request; "unknown" means GitHub is still checking. */
export type MergeState = "clean" | "conflicts" | "blocked" | "behind" | "unstable" | "unknown";

export interface PrDetail {
  owner: string;
  repo: string;
  number: number;
  title: string;
  author: string;
  authorAvatar: string;
  status: PrStatus;
  headBranch: string;
  baseBranch: string;
  createdAt: string;
  updatedAt: string;
  additions: number;
  deletions: number;
  changedFilesCount: number;
  htmlUrl: string;
  mergeState?: MergeState;
  checks: PrCheck[];
  files: PrFile[];
  comments: PrComment[];
  summary?: PrSummary;
  risk?: PrRisk;
  secretWarning?: SecretLeakWarning;
  /** Why the AI summary or risk is missing, in plain words. Never raw server text. */
  aiNotice?: { code: string; message: string };
}

export type OrgApprovalStatus =
  | "active"
  | "pending_approval"
  | "sso_required"
  | "ip_blocked"
  | "suspended";

export interface OrgInstallation {
  id: string;
  org: string;
  avatarUrl: string;
  status: OrgApprovalStatus;
  ssoUrl?: string;
  /** Where to change which repositories this account shares (GitHub). */
  manageUrl?: string;
}

export interface InstallationList {
  items: OrgInstallation[];
  /** Install MergeMate on another account or organization (GitHub). */
  installUrl: string;
}

export interface HighlightRegion {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  comment: string;
}

export interface HighlightResult {
  insight: string;
  regions: HighlightRegion[];
  requestId: string;
}

/** Settings as the API stores them. Theme is a device preference and lives in ThemeContext. */
export type UserSettings = Settings;

export interface BillingPlan {
  plan: "free" | "pro";
  status: string;
  renewsAt?: string;
  cancelAt?: string;
}

export interface PublicPost {
  slug: string;
  type: "news" | "changelog";
  title: string;
  date: string;
  summary: string;
  content: string;
}
