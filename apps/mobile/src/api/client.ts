import type {NoteContext,PrivateNote,SavePrivateNote,FeatureFlags, Project, Card, Lock, TrackEvent, CreateCardRequest, UpdateCardRequest, ReorderCardRequest, ProceedWithTrackResponse, BrainRunResponse} from "@mergemate/contracts";
import type {InboxMutation,InboxReceipt} from "@mergemate/contracts";
import type {PrSearchFilters,PrSearchPage} from '@mergemate/contracts';
export type WorkspacePage<T>={items:T[];nextCursor:string|null;capped?:boolean;headSha?:string};
export type WorkspaceRead={headSha?:string;signal?:AbortSignal};
import type { AiPreferenceUpdate, AiPreferences } from "@mergemate/contracts";
import {
  User,
  Session,
  Repo,
  Notification,
  NotificationFilter,
  PrSummary,
  PrAnswer,
  ReviewPlan,
  AiEngineInfo,
  PrRisk,
  TriageItem,
  TriageLane,
  PrDetail,
  InstallationList,
  HighlightResult,
  UserSettings,
  BillingPlan,
  PublicPost,
} from "../types";

/**
 * The one interface the screens talk to. HttpApiClient (real API) and MockApiClient (tests and the
 * development fallback) both implement it. Failures are thrown as ApiClientError with a message that
 * is safe to show.
 */
export interface ApiClient {
  isMock: boolean;
  invalidateCache(): void;
  invalidateInbox():void;
  clearCache(): void;
  invalidateSession(): void;
  getActivityHistory(filter?: 'all'|'review',cursor?:string|null): Promise<{items:Notification[];nextCursor:string|null}>;
  markActivityRead(id:string):Promise<void>;
  getNotificationPage(filter?: NotificationFilter, cursor?: string | null, search?: string): Promise<{items: Notification[]; nextCursor: string | null;serverTime?:string;refreshAt?:string|null}>;
  searchPrs(filters:PrSearchFilters,cursor?:string|null,signal?:AbortSignal):Promise<PrSearchPage>;
  getRepoPage(cursor?: string | null): Promise<{items: Repo[]; nextCursor: string | null}>;
  getFeatureFlags(refresh?:boolean): Promise<FeatureFlags>;
  health(): Promise<{ ok: boolean; version: string }>;

  // Auth. The real client keeps the session itself: the cookie plus an in-memory CSRF token on web, a
  // bearer token in secure storage on native. The sessions it returns never carry either.
  startGithubAuth(platform: "ios" | "android" | "web", codeChallenge: string): Promise<{ authorizeUrl: string; state: string }>;
  completeGithubAuth(code: string, state: string, codeVerifier: string): Promise<{ session: Session; user: User }>;
  startDemoSession(): Promise<{ session: Session; user: User }>;
  refreshSession(): Promise<Session>;
  getMe(): Promise<User & {demo?:boolean}>;
  getCsrfToken(): Promise<{ csrfToken: string }>;
  logout(): Promise<void>;
  deleteAccount(): Promise<void>;
  /** Called when the API says the session is no longer valid (after the stored token is cleared). */
  setUnauthorizedHandler(handler: (() => void) | null): void;

  // AI Consent
  getConsent(): Promise<{ ai: { granted: boolean; version: string } }>;
  setConsent(granted: boolean): Promise<void>;
  /** Canonical account-owned AI choices: processing consent, the independent summaries preference and a revision. */
  getAiPreferences(): Promise<AiPreferences>;
  updateAiPreferences(update: AiPreferenceUpdate): Promise<AiPreferences>;

  // Repos & Orgs
  getRepos(): Promise<Repo[]>;
  getRepoPulls(owner: string, repo: string, signal?: AbortSignal): Promise<import("@mergemate/contracts").RepoPullList>;
  getRepoBranches(owner: string, repo: string, signal?: AbortSignal): Promise<import("@mergemate/contracts").RepoBranchList>;
  toggleWatchRepo(id: string, watching: boolean): Promise<Repo>;
  getOrgInstallations(): Promise<InstallationList>;

  getInboxUndo():Promise<import("@mergemate/contracts").InboxUndo>;
  getInboxPreference():Promise<{filter:NotificationFilter}>;
  setInboxPreference(filter:NotificationFilter):Promise<{filter:NotificationFilter}>;
  mutateInboxItem(id:string,input:InboxMutation):Promise<InboxReceipt>;

  // Notifications / Inbox
  getNotifications(filter?: NotificationFilter): Promise<Notification[]>;
  markNotificationDone(id: string, observedUpdatedAt?: string): Promise<void>;
  snoozeNotification(id: string, until: string): Promise<void>;
  restoreNotification(id: string): Promise<void>;

  getPrDependencies(owner:string,repo:string,number:number,headSha?:string,signal?:AbortSignal):Promise<import("@mergemate/contracts").DependencyContext>;
  getPrVisualAsset(owner:string,repo:string,number:number,path:string,side:"before"|"after",headSha?:string,signal?:AbortSignal):Promise<import("@mergemate/contracts").PrVisualAsset>;

  // Pull Requests
  getPrFilePage(owner: string, repo: string, number: number, cursor?:string|null,options?:WorkspaceRead):Promise<WorkspacePage<import('../types').PrFile>>;
  getPrCommentPage(owner: string, repo: string, number: number, cursor?:string|null,options?:WorkspaceRead):Promise<WorkspacePage<import('../types').PrComment>>;
  getPrCheckPage(owner:string,repo:string,number:number,cursor?:string|null,options?:WorkspaceRead):Promise<WorkspacePage<import('../types').PrCheck>>;
  getPrMetadata(owner: string, repo: string, number: number,signal?:AbortSignal,workspace?:boolean): Promise<PrDetail>;
  getPrDetail(owner: string, repo: string, number: number,signal?:AbortSignal): Promise<PrDetail>;
  getPrSummary(owner: string, repo: string, number: number,signal?:AbortSignal): Promise<PrSummary>;
  getPrRisk(owner: string, repo: string, number: number,signal?:AbortSignal): Promise<PrRisk>;
  /** Reading order, verify checklist and a copy-only draft comment. Read-only: nothing is posted to GitHub. */
  getReviewPlan(owner: string, repo: string, number: number,signal?:AbortSignal): Promise<ReviewPlan>;
  /** One grounded answer about this PR, with citations limited to its files. */
  askPr(owner: string, repo: string, number: number, question: string,signal?:AbortSignal): Promise<PrAnswer>;

  /** Which model serves each AI job. null when this API does not offer it. */
  getAiEngine(): Promise<AiEngineInfo | null>;

  // Triage
  getTriageQueue(): Promise<TriageItem[]>;
  undoTriageChoice(prRef: string): Promise<void>;
  setTriageChoice(prRef: string, lane: TriageLane): Promise<void>;

  transcribeVoice(bytes:Uint8Array,signal?:AbortSignal):Promise<string>;
  getPrivateNotes(context:NoteContext):Promise<PrivateNote[]>;
  savePrivateNote(input:SavePrivateNote):Promise<PrivateNote>;
  removePrivateNote(id:string,context:NoteContext):Promise<void>;

  // Highlight
  analyzeHighlight(imageUri: string, note?: string, mimeType?: string,signal?:AbortSignal): Promise<HighlightResult>;

  // Settings
  getSettings(): Promise<UserSettings>;
  updateSettings(settings: Partial<UserSettings>): Promise<UserSettings>;
  registerPushToken(deviceId: string, token: string): Promise<void>;
  unregisterPushToken(deviceId: string): Promise<void>;
  /** The server's Web Push public key, or null when this API does not offer browser notifications. */
  getWebPushKey(): Promise<string | null>;
  registerWebPush(deviceId: string, subscription: { endpoint: string; keys: { p256dh: string; auth: string } }): Promise<void>;
  unregisterWebPush(deviceId: string): Promise<void>;
  /** Whether the user saved their own Meta key. null when this API does not offer the feature yet. */
  getMetaKeyStatus(): Promise<{ configured: boolean } | null>;
  /** Web only. The key is sent once and never read back. */
  saveMetaKey(key: string): Promise<void>;
  removeMetaKey(): Promise<void>;

  // Billing (Web only; iOS plan status only)
  getBillingPlan(): Promise<BillingPlan>;
  createCheckoutSession(priceKey: "pro_monthly" | "pro_annual"): Promise<{ url: string }>;
  createPortalSession(): Promise<{ url: string }>;

  // Public
  getPublicPosts(type: "news" | "changelog"): Promise<PublicPost[]>;
  getPublicPostPage(type:"news"|"changelog",cursor?:string|null):Promise<{items:PublicPost[];nextCursor:string|null}>;
  getPublicPost(slug:string):Promise<PublicPost>;
  sendSupportMessage(email: string, message: string): Promise<void>;

  // Brain Board API
  getBrainProjects(): Promise<{projects: Project[]}>;
  getBrainBoard(projectId: string): Promise<{project: Project; cards: Card[]; locks: Lock[]; trackTail: TrackEvent[]}>;
  createBrainCard(input: CreateCardRequest): Promise<Card>;
  updateBrainCard(input: UpdateCardRequest): Promise<Card>;
  reorderBrainCard(input: ReorderCardRequest): Promise<Card[]>;
  setBrainRules(projectId: string, rules: string): Promise<Project>;
  proceedBrain(projectId: string): Promise<ProceedWithTrackResponse>;
  runBrain(projectId: string): Promise<BrainRunResponse>;
}

// In-memory CSRF token storage for web sessions (strictly never saved to disk or localStorage)
let inMemoryCsrfToken: string | null = null;

export function getInMemoryCsrfToken(): string | null {
  return inMemoryCsrfToken;
}

export function setInMemoryCsrfToken(token: string | null): void {
  inMemoryCsrfToken = token;
}
