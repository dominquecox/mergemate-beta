import {demoVisualAsset} from "../workspace/visual";
import type {PrSearchFilters,PrSearchPage} from '@mergemate/contracts';
import {disabledFeatureFlags} from "./feature-flags";
import { ApiClientError, messageForCode } from "./errors";
import type { AiPreferenceUpdate, AiPreferences } from "@mergemate/contracts";
import { AI_CONSENT_VERSION } from "../config/consent";
import { ApiClient } from "./client";
import {
  seedBilling,
  seedNotifications,
  seedOrgs,
  seedPrDetails,
  seedPublicPosts,
  seedRepos,
  seedSession,
  seedSettings,
  seedTriageQueue,
  seedUser,
} from "./mock-data";
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
  OrgInstallation,
  InstallationList,
  HighlightResult,
  UserSettings,
  BillingPlan,
  PublicPost,
} from "../types";

export class MockApiClient implements ApiClient {
  async getPrVisualAsset(_owner:string,_repo:string,_number:number,path:string,side:"before"|"after"){return demoVisualAsset(path,side);}

  /** Sample-data search: the same filters as the API, applied to the sample pull requests. */
  async searchPrs(filters:PrSearchFilters,_cursor?:string|null,_signal?:AbortSignal):Promise<PrSearchPage>{
    const terms=filters.query.toLowerCase().split(/\s+/).filter(Boolean);
    const items=this.notifications.filter(n=>
      terms.every(t=>n.title.toLowerCase().includes(t))
      &&(!filters.repo||n.repo.toLowerCase()===filters.repo.toLowerCase())
      &&(!filters.author||n.author.toLowerCase()===filters.author.toLowerCase())
      &&(filters.risk==='all'||(filters.risk==='unassessed'?!n.risk:n.risk===filters.risk))
      &&(!filters.from||n.updatedAt.slice(0,10)>=filters.from)
      &&(!filters.to||n.updatedAt.slice(0,10)<=filters.to),
    ).map(({kind:_kind,read:_read,...row})=>row);
    return {items,nextCursor:null,candidates:items.length,incomplete:false,capped:false};
  }
  async getFeatureFlags(){return disabledFeatureFlags();}
  invalidateInbox():void {}
  invalidateCache(): void {  }
  clearCache(): void {}
  invalidateSession():void{}
  async getPrCheckPage(owner:string,repo:string,number:number){return {items:(await this.getPrDetail(owner,repo,number)).checks,nextCursor:null};}
  async getPrFilePage(owner: string, repo: string, number: number, _cursor?: string | null) {return {items:(await this.getPrDetail(owner,repo,number)).files,nextCursor:null};}
  async getPrCommentPage(owner: string, repo: string, number: number, _cursor?: string | null) {return {items:(await this.getPrDetail(owner,repo,number)).comments,nextCursor:null};}
  async undoTriageChoice(_prRef: string): Promise<void> {}
  async getNotificationPage(filter: NotificationFilter = 'all', cursor?: string | null, search = '') {
    const all = (await this.getNotifications(filter)).filter(item => `${item.title} ${item.repo} ${item.author}`.toLowerCase().includes(search.toLowerCase()));
    const start = Number(cursor ?? 0);
    return {items: all.slice(start,start+25), nextCursor: start+25 < all.length ? String(start+25) : null};
  }
  async getRepoPage(cursor?: string | null) {
    const all = await this.getRepos(); const start = Number(cursor ?? 0);
    return {items: all.slice(start,start+25), nextCursor: start+25 < all.length ? String(start+25) : null};
  }

  async transcribeVoice():Promise<string>{throw new ApiClientError('forbidden','Recording is unavailable in demo mode.');}
  async getPrivateNotes():Promise<import('@mergemate/contracts').PrivateNote[]>{return [];}
  async savePrivateNote():Promise<import('@mergemate/contracts').PrivateNote>{throw new ApiClientError('forbidden','Private notes are unavailable in demo mode.');}
  async removePrivateNote():Promise<void>{throw new ApiClientError('forbidden','Private notes are unavailable in demo mode.');}
  async getInboxUndo(){return null;}
  async getInboxPreference(){return {filter:'all' as const};}
  async setInboxPreference(filter:NotificationFilter){return {filter};}
  async mutateInboxItem():Promise<import('@mergemate/contracts').InboxReceipt>{throw new ApiClientError('forbidden','Inbox changes are unavailable in demo mode.');}
  public isMock = true;

  private user: User = seedUser();

  private session: Session = seedSession();

  private consentGranted = true;

  private repos: Repo[] = seedRepos();

  private orgs: OrgInstallation[] = seedOrgs();

  private notifications: Notification[] = seedNotifications();

  private prDetails: Record<string, PrDetail> = seedPrDetails();

  private triageQueue: TriageItem[] = seedTriageQueue();

  private settings: UserSettings = seedSettings();

  private metaKeyConfigured = false;

  private billing: BillingPlan = seedBilling();

  private publicPosts: PublicPost[] = seedPublicPosts();

  async health(): Promise<{ ok: boolean; version: string }> {
    return { ok: true, version: "0.1.0-mock" };
  }

  async startGithubAuth(_platform: "ios" | "android" | "web", _codeChallenge: string): Promise<{ authorizeUrl: string; state: string }> {
    return {
      authorizeUrl: "https://github.com/login/oauth/authorize?client_id=demo&state=demo_state",
      state: "demo_state",
    };
  }

  async completeGithubAuth(_code: string, _state: string, _codeVerifier: string): Promise<{ session: Session; user: User }> {
    return {
      session: this.session,
      user: this.user,
    };
  }

  async startDemoSession(): Promise<{ session: Session; user: User }> {
    return {
      session: {
        token: "mm_demo_session_active",
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        demo: true,
      },
      user: {
        id: "demo_user",
        login: "demo-developer",
        name: "Demo Developer",
        avatarUrl: "https://avatars.githubusercontent.com/u/92395929?v=4",
      },
    };
  }

  async refreshSession(): Promise<Session> {
    return { expiresAt: new Date(Date.now() + 86400000).toISOString() };
  }

  setUnauthorizedHandler(_handler: (() => void) | null): void {
    // The mock never expires a session.
  }

  async getMe(): Promise<User & {demo?:boolean}> {
    return this.user;
  }

  async getCsrfToken(): Promise<{ csrfToken: string }> {
    return { csrfToken: "mock_csrf_" + Math.random().toString(36).slice(2) };
  }

  async logout(): Promise<void> {
    // no-op for mock
  }

  async deleteAccount(): Promise<void> {
    // no-op for mock
  }

  async getConsent(): Promise<{ ai: { granted: boolean; version: string } }> {
    return { ai: { granted: this.consentGranted, version: AI_CONSENT_VERSION } };
  }

  async setConsent(granted: boolean): Promise<void> {
    this.consentGranted = granted;
  }

  private aiSummariesPref = true;
  private aiRevision = 1;

  private aiPrefs(): AiPreferences {
    return {
      ai: { granted: this.consentGranted, version: AI_CONSENT_VERSION, currentVersion: AI_CONSENT_VERSION },
      aiSummaries: this.aiSummariesPref,
      revision: `mock-${this.aiRevision}`,
    };
  }

  async getAiPreferences(): Promise<AiPreferences> {
    return this.aiPrefs();
  }

  async updateAiPreferences(update: AiPreferenceUpdate): Promise<AiPreferences> {
    if (update.action !== "revoke" && update.expectedRevision !== this.aiPrefs().revision) {
      throw new ApiClientError("consent_changed", messageForCode("consent_changed"));
    }
    if (update.action === "grant") {
      this.consentGranted = true;
      this.aiSummariesPref = true;
    } else if (update.action === "revoke") {
      this.consentGranted = false;
      this.aiSummariesPref = false;
    } else {
      if (update.enabled && !this.consentGranted) throw new ApiClientError("consent_required", messageForCode("consent_required"));
      this.aiSummariesPref = update.enabled;
    }
    this.aiRevision += 1;
    return this.aiPrefs();
  }

  async getRepos(): Promise<Repo[]> {
    return [...this.repos];
  }

  async toggleWatchRepo(id: string, watching: boolean): Promise<Repo> {
    const r = this.repos.find((x) => x.id === id);
    if (r) {
      r.watching = watching;
      return { ...r };
    }
    throw new Error("Repo not found");
  }

  async getOrgInstallations(): Promise<InstallationList> {
    return { items: [...this.orgs], installUrl: "https://github.com/settings/installations" };
  }

  async getNotifications(filter: NotificationFilter = "all"): Promise<Notification[]> {
    if (filter === "all") return [...this.notifications];
    return this.notifications.filter((n) => {
      if (filter === "review") return n.kind === "review";
      if (filter === "mentions") return n.kind === "mention";
      if (filter === "mine") return n.kind === "mine";
      return true;
    });
  }

  async markNotificationDone(id: string): Promise<void> {
    this.notifications = this.notifications.filter((n) => n.id !== id);
  }

  async restoreNotification(_id: string): Promise<void> {
    // The mock keeps no done/snooze state to undo beyond the list the screen holds.
  }

  async snoozeNotification(id: string, _until: string): Promise<void> {
    this.notifications = this.notifications.filter((n) => n.id !== id);
  }

  async getPrMetadata(owner: string, repo: string, number: number): Promise<PrDetail> {
    const { summary: _summary, risk: _risk, ...metadata } = await this.getPrDetail(owner, repo, number);
    return metadata;
  }

  async getPrDetail(owner: string, repo: string, number: number): Promise<PrDetail> {
    const key = `${owner}/${repo}/${number}`;
    if (this.prDetails[key]) {
      return this.prDetails[key];
    }
    // Fallback generated PR detail
    return {
      owner,
      repo,
      number,
      title: `Pull Request #${number} in ${repo}`,
      author: "contributor",
      authorAvatar: "https://avatars.githubusercontent.com/u/92395929?v=4",
      status: "open",
      headBranch: "feat/update",
      baseBranch: "main",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      additions: 15,
      deletions: 3,
      changedFilesCount: 2,
      htmlUrl: `https://github.com/${owner}/${repo}/pull/${number}`,
      checks: [{ id: "c1", name: "build", status: "completed", conclusion: "success" }],
      files: [{ filename: "src/index.ts", status: "modified", additions: 15, deletions: 3 }],
      comments: [],
      summary: {
        whatChanged: "Routine updates and dependency maintenance.",
        whyItMatters: "Keeps the codebase fresh and current.",
        suggestedFocus: ["src/index.ts"],
        coverage: { analyzedFiles: 2, skippedFiles: 0, truncatedFiles: 0 },
      },
      risk: {
        level: "low",
        reasons: ["Small diff", "Zero breaking changes"],
        coverage: { analyzedFiles: 2, skippedFiles: 0, truncatedFiles: 0 },
      },
    };
  }

  async getPrSummary(owner: string, repo: string, number: number): Promise<PrSummary> {
    const detail = await this.getPrDetail(owner, repo, number);
    if (!detail.summary) {
      throw new Error("Summary unavailable");
    }
    return detail.summary;
  }

  async getAiEngine(): Promise<AiEngineInfo | null> {
    return null;
  }

  /** Sample files in reading order: source before tests, lockfiles last. */
  private async sampleFiles(owner: string, repo: string, number: number) {
    const detail = await this.getPrDetail(owner, repo, number);
    const rank = (name: string) => (/lock\.json$|\.lock$/.test(name) ? 2 : /test|spec/.test(name) ? 1 : 0);
    const files = [...detail.files].sort((x, y) => rank(x.filename) - rank(y.filename) || y.additions + y.deletions - (x.additions + x.deletions));
    return { detail, files, coverage: { analyzedFiles: files.length, skippedFiles: 0, truncatedFiles: 0 } };
  }

  async getReviewPlan(owner: string, repo: string, number: number): Promise<ReviewPlan> {
    const { detail, files, coverage } = await this.sampleFiles(owner, repo, number);
    const reasons = detail.risk?.reasons ?? [];
    return {
      readingOrder: files.slice(0, 5).map((f, i) => ({
        file: f.filename,
        why: i === 0 ? `Biggest source change (+${f.additions} -${f.deletions}); start here.` : `${f.status === "added" ? "New file" : "Changed"}, +${f.additions} -${f.deletions}.`,
      })),
      verify: reasons.slice(0, 4).concat(detail.checks.some((c) => c.conclusion === "failure") ? ["A failing check is explained or fixed."] : ["Checks are green."]),
      draftComment: `Thanks for "${detail.title}". ${detail.summary?.suggestedFocus[0] ? `I read ${detail.summary.suggestedFocus[0]} first.` : ""} Happy to approve once the points above are confirmed.`.replace("  ", " "),
      coverage,
      model: "sample:demo",
    };
  }

  async askPr(owner: string, repo: string, number: number, question: string): Promise<PrAnswer> {
    const { detail, files, coverage } = await this.sampleFiles(owner, repo, number);
    const q = question.toLowerCase();
    const failing = detail.checks.filter((c) => c.conclusion === "failure").map((c) => c.name);
    const answer = /break|risk|danger/.test(q)
      ? detail.risk?.reasons.join(" ") || "Nothing risky stands out in this sample."
      : /test|check|ci/.test(q)
        ? failing.length ? `Failing: ${failing.join(", ")}. ${detail.checks.length - failing.length} other checks pass.` : `All ${detail.checks.length} checks pass.`
        : /first|start|read/.test(q)
          ? `Start with ${files[0]?.filename ?? "the first changed file"}.`
          : detail.summary?.whatChanged ?? "This is sample data.";
    return { answer, citations: files.slice(0, 2).map((f) => ({ file: f.filename })), coverage, model: "sample:demo" };
  }

  async getPrRisk(owner: string, repo: string, number: number): Promise<PrRisk> {
    const detail = await this.getPrDetail(owner, repo, number);
    if (!detail.risk) {
      throw new Error("Risk unavailable");
    }
    return detail.risk;
  }

  async getTriageQueue(): Promise<TriageItem[]> {
    return [...this.triageQueue];
  }

  async setTriageChoice(prRef: string, _lane: TriageLane): Promise<void> {
    this.triageQueue = this.triageQueue.filter((x) => x.prRef !== prRef);
  }

  async analyzeHighlight(_imageUri: string, note?: string, _mimeType?: string): Promise<HighlightResult> {
    return {
      insight: `Analyzed screenshot with Meta AI vision: UI components verified with 16px padding. ${
        note ? `Note evaluated: "${note}".` : ""
      }`,
      regions: [
        {
          id: "r1",
          x: 60,
          y: 40,
          width: 880,
          height: 80,
          label: "Header Bar",
          comment: "Correctly shows centered wordmark and 44pt tap target.",
        },
        {
          id: "r2",
          x: 60,
          y: 200,
          width: 880,
          height: 220,
          label: "Risk Card",
          comment: "High-risk badge clearly pairs red label with warning symbol.",
        },
      ],
      requestId: "req_highlight_mock_1",
    };
  }

  async getSettings(): Promise<UserSettings> {
    return { ...this.settings };
  }

  async updateSettings(settings: Partial<UserSettings>): Promise<UserSettings> {
    this.settings = {
      ...this.settings,
      ...settings,
      notifications: { ...this.settings.notifications, ...settings.notifications },
    };
    return { ...this.settings };
  }

  async registerPushToken(_deviceId: string, _token: string): Promise<void> {
    // no-op in mock
  }

  async unregisterPushToken(_deviceId: string): Promise<void> {
    // no-op in mock
  }

  async getWebPushKey(): Promise<string | null> {
    return null; // the mock offers no browser notifications
  }

  async registerWebPush(): Promise<void> {
    // no-op in mock
  }

  async unregisterWebPush(): Promise<void> {
    // no-op in mock
  }

  async getMetaKeyStatus(): Promise<{ configured: boolean } | null> {
    return { configured: this.metaKeyConfigured };
  }

  async saveMetaKey(_key: string): Promise<void> {
    this.metaKeyConfigured = true;
  }

  async removeMetaKey(): Promise<void> {
    this.metaKeyConfigured = false;
  }

  async getBillingPlan(): Promise<BillingPlan> {
    return { ...this.billing };
  }

  async createCheckoutSession(_priceKey: "pro_monthly" | "pro_annual"): Promise<{ url: string }> {
    return { url: "https://checkout.stripe.com/c/pay/test_session_mock" };
  }

  async createPortalSession(): Promise<{ url: string }> {
    return { url: "https://billing.stripe.com/p/session/test_portal_mock" };
  }

  async getPublicPosts(type: "news" | "changelog"): Promise<PublicPost[]> {
    return this.publicPosts.filter((p) => p.type === type);
  }

  async getPublicPostPage(type:"news"|"changelog",cursor?:string|null):Promise<{items:PublicPost[];nextCursor:string|null}> {
    const all=await this.getPublicPosts(type);const offset=Number(cursor??0);
    if(!Number.isSafeInteger(offset)||offset<0)throw new ApiClientError("validation_failed","Invalid page.");
    return {items:all.slice(offset,offset+50),nextCursor:offset+50<all.length?String(offset+50):null};
  }
  async getPublicPost(slug:string):Promise<PublicPost> {
    const post=this.publicPosts.find(item=>item.slug===slug);
    if(!post)throw new ApiClientError("not_found","This post is unavailable.");
    return post;
  }

  async sendSupportMessage(_email: string, _message: string): Promise<void> {
    // no-op in mock
  }
}

export const mockClient = new MockApiClient();
