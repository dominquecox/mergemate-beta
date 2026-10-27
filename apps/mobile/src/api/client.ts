import {
  User,
  Session,
  Repo,
  Notification,
  NotificationFilter,
  PrSummary,
  PrRisk,
  TriageItem,
  TriageLane,
  PrDetail,
  OrgInstallation,
  HighlightResult,
  UserSettings,
  BillingPlan,
  PublicPost,
} from "../types";

export interface ApiClient {
  isMock: boolean;
  health(): Promise<{ ok: boolean; version: string }>;

  // Auth
  startGithubAuth(platform: "ios" | "web"): Promise<{ authorizeUrl: string; state: string }>;
  completeGithubAuth(code: string, state: string, codeVerifier: string): Promise<{ session: Session; user: User }>;
  startDemoSession(): Promise<{ session: Session; user: User }>;
  getMe(): Promise<User>;
  getCsrfToken(): Promise<{ csrfToken: string }>;
  logout(): Promise<void>;
  deleteAccount(): Promise<void>;

  // AI Consent
  getConsent(): Promise<{ ai: { granted: boolean; version: string } }>;
  setConsent(granted: boolean): Promise<void>;

  // Repos & Orgs
  getRepos(): Promise<Repo[]>;
  toggleWatchRepo(id: string, watching: boolean): Promise<Repo>;
  getOrgInstallations(): Promise<OrgInstallation[]>;

  // Notifications / Inbox
  getNotifications(filter?: NotificationFilter): Promise<Notification[]>;
  markNotificationDone(id: string): Promise<void>;
  snoozeNotification(id: string, until: string): Promise<void>;

  // Pull Requests
  getPrDetail(owner: string, repo: string, number: number): Promise<PrDetail>;
  getPrSummary(owner: string, repo: string, number: number): Promise<PrSummary>;
  getPrRisk(owner: string, repo: string, number: number): Promise<PrRisk>;

  // Triage
  getTriageQueue(): Promise<TriageItem[]>;
  setTriageChoice(prRef: string, lane: TriageLane): Promise<void>;

  // Highlight
  analyzeHighlight(imageUri: string, note?: string): Promise<HighlightResult>;

  // Settings
  getSettings(): Promise<UserSettings>;
  updateSettings(settings: Partial<UserSettings>): Promise<UserSettings>;

  // Billing (Web only; iOS plan status only)
  getBillingPlan(): Promise<BillingPlan>;
  createCheckoutSession(priceKey: "pro_monthly" | "pro_annual"): Promise<{ url: string }>;
  createPortalSession(): Promise<{ url: string }>;

  // Public
  getPublicPosts(type: "news" | "changelog"): Promise<PublicPost[]>;
  sendSupportMessage(email: string, message: string): Promise<void>;
}

// In-memory CSRF token storage for web sessions (strictly never saved to disk or localStorage)
let inMemoryCsrfToken: string | null = null;

export function getInMemoryCsrfToken(): string | null {
  return inMemoryCsrfToken;
}

export function setInMemoryCsrfToken(token: string | null): void {
  inMemoryCsrfToken = token;
}
