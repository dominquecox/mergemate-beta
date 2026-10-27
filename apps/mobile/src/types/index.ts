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
  checks: PrCheck[];
  files: PrFile[];
  comments: PrComment[];
  summary?: PrSummary;
  risk?: PrRisk;
  secretWarning?: SecretLeakWarning;
}

export type OrgApprovalStatus =
  | "active"
  | "pending_approval"
  | "sso_required"
  | "ip_blocked";

export interface OrgInstallation {
  id: string;
  org: string;
  avatarUrl: string;
  status: OrgApprovalStatus;
  ssoUrl?: string;
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

export interface QuietHours {
  enabled: boolean;
  start: string; // HH:mm
  end: string; // HH:mm
}

export interface UserSettings {
  notificationsEnabled: boolean;
  quietHours: QuietHours;
  aiSummariesEnabled: boolean;
  theme: ThemeMode;
  emailAlerts: boolean;
}

export interface BillingPlan {
  plan: "free" | "pro";
  status: "active" | "past_due" | "canceled";
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
