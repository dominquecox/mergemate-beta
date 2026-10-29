import {disabledFeatureFlags} from "./feature-flags";
import { ApiClientError, messageForCode } from "./errors";
import type { AiPreferenceUpdate, AiPreferences } from "@mergemate/contracts";
import { AI_CONSENT_VERSION } from "../config/consent";
import { ApiClient } from "./client";
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
  InstallationList,
  HighlightResult,
  UserSettings,
  BillingPlan,
  PublicPost,
} from "../types";

export class MockApiClient implements ApiClient {
  async getFeatureFlags(){return disabledFeatureFlags();}
  invalidateCache(): void {  }
  clearCache(): void {}
  invalidateSession():void{}
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

  public isMock = true;

  private user: User = {
    id: "user_demo_1",
    login: "dominquecox",
    name: "Alex Rivera",
    avatarUrl: "https://avatars.githubusercontent.com/u/92395929?v=4",
  };

  private session: Session = {
    token: "mm_demo_token_valid",
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    demo: true,
  };

  private consentGranted = true;

  private repos: Repo[] = [
    { id: "repo_1", fullName: "dominquecox/mergemate", private: true, watching: true },
    { id: "repo_2", fullName: "ploonu-llc/typepress", private: true, watching: true },
    { id: "repo_3", fullName: "dominquecox/vidiloopapi", private: false, watching: false },
    { id: "repo_4", fullName: "ploonu-llc/mariahlabs", private: true, watching: true },
  ];

  private orgs: OrgInstallation[] = [
    {
      id: "org_1",
      org: "ploonu-llc",
      avatarUrl: "https://avatars.githubusercontent.com/u/92395929?v=4",
      status: "active",
    },
    {
      id: "org_2",
      org: "acme-corp",
      avatarUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100&auto=format&fit=crop&q=60",
      status: "pending_approval",
    },
    {
      id: "org_3",
      org: "security-team",
      avatarUrl: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=100&auto=format&fit=crop&q=60",
      status: "sso_required",
      ssoUrl: "https://github.com/orgs/security-team/sso",
    },
    {
      id: "org_4",
      org: "corp-firewall",
      avatarUrl: "https://images.unsplash.com/photo-1563986768609-322da13575f3?w=100&auto=format&fit=crop&q=60",
      status: "ip_blocked",
    },
  ];

  private notifications: Notification[] = [
    {
      id: "notif_1",
      kind: "review",
      repo: "dominquecox/mergemate",
      number: 7,
      title: "API: Worker scaffold, contracts, provider adapter (#7)",
      author: "claude-bot",
      status: "open",
      risk: "low",
      summaryLine: "Hono Worker scaffold with typed request/response schemas and Meta Model API provider adapter.",
      updatedAt: new Date(Date.now() - 3600000).toISOString(),
      read: false,
    },
    {
      id: "notif_2",
      kind: "mine",
      repo: "dominquecox/mergemate",
      number: 8,
      title: "Tooling: require Node 22 (#8)",
      author: "dominquecox",
      status: "open",
      risk: "low",
      summaryLine: "Aligned root and package engines to Node >=22 for Wrangler compatibility.",
      updatedAt: new Date(Date.now() - 7200000).toISOString(),
      read: true,
    },
    {
      id: "notif_3",
      kind: "review",
      repo: "ploonu-llc/typepress",
      number: 412,
      title: "Database migration without rollback & auth middleware change (#412)",
      author: "external-contributor",
      status: "open",
      risk: "high",
      summaryLine: "Touches auth middleware and includes database migration without rollback; possible secret leak detected.",
      updatedAt: new Date(Date.now() - 14400000).toISOString(),
      read: false,
    },
    {
      id: "notif_4",
      kind: "mention",
      repo: "dominquecox/vidiloopapi",
      number: 108,
      title: "Worker AI inference rate limiter (#108)",
      author: "agy-agent",
      status: "open",
      risk: "medium",
      summaryLine: "Adds per-session sliding window rate limiter before AI dispatch.",
      updatedAt: new Date(Date.now() - 86400000).toISOString(),
      read: true,
    },
  ];

  private prDetails: Record<string, PrDetail> = {
    "dominquecox/mergemate/7": {
      owner: "dominquecox",
      repo: "mergemate",
      number: 7,
      title: "API: Worker scaffold, contracts, provider adapter",
      author: "claude-bot",
      authorAvatar: "https://avatars.githubusercontent.com/u/92395929?v=4",
      status: "open",
      headBranch: "claude/gallant-ritchie-gvljxr",
      baseBranch: "development",
      createdAt: new Date(Date.now() - 7200000).toISOString(),
      updatedAt: new Date(Date.now() - 3600000).toISOString(),
      additions: 4988,
      deletions: 33,
      changedFilesCount: 32,
      htmlUrl: "https://github.com/dominquecox/mergemate/pull/7",
      checks: [
        { id: "c1", name: "typecheck", status: "completed", conclusion: "success" },
        { id: "c2", name: "lint", status: "completed", conclusion: "success" },
        { id: "c3", name: "vitest (32 tests)", status: "completed", conclusion: "success" },
        { id: "c4", name: "secret-scan (gitleaks)", status: "completed", conclusion: "success" },
      ],
      files: [
        { filename: "apps/api/src/app.ts", status: "added", additions: 50, deletions: 0 },
        { filename: "apps/api/src/ai/provider.ts", status: "added", additions: 106, deletions: 0 },
        { filename: "packages/contracts/src/index.ts", status: "added", additions: 4, deletions: 0 },
        { filename: "package-lock.json", status: "modified", additions: 4015, deletions: 0 },
      ],
      comments: [
        {
          id: "com_1",
          author: "dominquecox",
          avatarUrl: "https://avatars.githubusercontent.com/u/92395929?v=4",
          body: "Scaffold verified on Node 22 with green gate exit codes.",
          createdAt: new Date(Date.now() - 1800000).toISOString(),
        },
      ],
      summary: {
        whatChanged: "Hono Worker scaffold with request IDs, rate limiting, and typed contracts for session and PR triage.",
        whyItMatters: "Establishes the server-side backend boundary and contracts before clients connect.",
        suggestedFocus: ["apps/api/src/ai/provider.ts", "packages/contracts/src/ai.ts"],
        coverage: { analyzedFiles: 32, skippedFiles: 0, truncatedFiles: 0 },
      },
      risk: {
        level: "low",
        reasons: ["Zero external network requests in tests", "No secret keys committed; all environment values read from Worker secrets"],
        coverage: { analyzedFiles: 32, skippedFiles: 0, truncatedFiles: 0 },
      },
    },
    "ploonu-llc/typepress/412": {
      owner: "ploonu-llc",
      repo: "typepress",
      number: 412,
      title: "Database migration without rollback & auth middleware change",
      author: "external-contributor",
      authorAvatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=60",
      status: "open",
      headBranch: "feature/billing-stripe-key",
      baseBranch: "main",
      createdAt: new Date(Date.now() - 14400000).toISOString(),
      updatedAt: new Date(Date.now() - 7200000).toISOString(),
      additions: 124,
      deletions: 18,
      changedFilesCount: 4,
      htmlUrl: "https://github.com/ploonu-llc/typepress/pull/412",
      checks: [
        { id: "c1", name: "typecheck", status: "completed", conclusion: "success" },
        { id: "c2", name: "lint", status: "completed", conclusion: "failure" },
      ],
      files: [
        { filename: "config/stripe.ts", status: "modified", additions: 12, deletions: 1 },
        { filename: "migrations/0042_users.sql", status: "added", additions: 80, deletions: 0 },
        { filename: "src/middleware/auth.ts", status: "modified", additions: 32, deletions: 17 },
      ],
      comments: [
        {
          id: "com_2",
          author: "security-auditor",
          avatarUrl: "https://avatars.githubusercontent.com/u/92395929?v=4",
          body: "Warning: Please remove raw test credentials from configuration file.",
          createdAt: new Date(Date.now() - 3600000).toISOString(),
        },
      ],
      summary: {
        whatChanged: "Modifies authentication middleware session verification and adds schema migration for billing profiles.",
        whyItMatters: "Changes core authentication path and database structure across all tenants.",
        suggestedFocus: ["config/stripe.ts (secret leak)", "migrations/0042_users.sql (missing down migration)"],
        coverage: { analyzedFiles: 4, skippedFiles: 0, truncatedFiles: 0 },
      },
      risk: {
        level: "high",
        reasons: [
          "Possible secret pattern detected in config/stripe.ts:12",
          "Database migration lacks a reversible rollback step",
          "Modifies core auth middleware",
        ],
        coverage: { analyzedFiles: 4, skippedFiles: 0, truncatedFiles: 0 },
        secretFindings: [{ file: "config/stripe.ts", line: 12, rule: "credential-assignment" }],
        quality: { needsCloserLook: true, reasons: ["No tests for the changed logic."] },
        assessedBy: "rules_and_ai",
      },
      secretWarning: {
        file: "config/stripe.ts",
        line: 12,
        maskedSnippet: 'const STRIPE_SECRET = "sk_live_••••••••••••••••••••••••";',
        rule: "stripe-api-key",
      },
    },
  };

  private triageQueue: TriageItem[] = [
    {
      prRef: "dominquecox/mergemate#7",
      lane: "needs_you",
      reason: "Requested your review on the API scaffold and contracts.",
    },
    {
      prRef: "ploonu-llc/typepress#412",
      lane: "needs_you",
      reason: "High risk: potential credential leak in config and auth modifications.",
    },
    {
      prRef: "dominquecox/vidiloopapi#108",
      lane: "fyi",
      reason: "Mentioned you regarding Workers AI rate limiting policy.",
    },
    {
      prRef: "dominquecox/mergemate#8",
      lane: "ignore",
      reason: "Your own tooling PR; checks already passing.",
    },
  ];

  private settings: UserSettings = {
    notifications: { review: true, mention: true, mine: true },
    quietHours: { start: "22:00", end: "08:00", timeZone: "UTC" },
    aiSummaries: true,
  };

  private metaKeyConfigured = false;

  private billing: BillingPlan = {
    plan: "free",
    status: "none",
    trialEligible: true,
    canManage: false,
  };

  private publicPosts: PublicPost[] = [
    {
      slug: "launch-ready",
      type: "news",
      title: "MergeMate Enters the Meta Global AI Hackathon",
      date: "2026-10-26",
      summary: "Introducing MergeMate: calm, fast, intelligent GitHub PR companion built with Meta AI models.",
      content: "MergeMate brings intelligent pull request triage, risk scoring, and image insights to mobile and web.",
    },
    {
      slug: "v0-1-release",
      type: "changelog",
      title: "v0.1.0: Foundation Release",
      date: "2026-10-26",
      summary: "First release with GitHub App authentication, PR detail view, and smart triage deck.",
      content: "Shipped the core iOS & web app with responsive layouts, offline resilience, and demo mode.",
    },
  ];

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
