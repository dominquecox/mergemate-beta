import { z } from "zod";
import {
  AuthCallbackResponse,
  AuthStartResponse,
  BillingLink,
  BillingPlan as BillingPlanSchema,
  ConsentState,
  CsrfResponse,
  DemoResponse,
  ErrorBody,
  HealthResponse,
  HighlightResult as HighlightResultSchema,
  InstallationList as InstallationListSchema,
  MetaKeyInput,
  MetaKeyStatus,
  NotificationPage,
  PostList,
  PrDetail as PrDetailSchema,
  PrRisk as PrRiskSchema,
  PrSummary as PrSummarySchema,
  PushTokenRegistered,
  RefreshResponse,
  RepoPage,
  Settings as SettingsSchema,
  TriageQueue,
  TriageRecord,
  User as UserSchema,
} from "@mergemate/contracts";
import type {
  BillingPlan,
  HighlightResult,
  InstallationList,
  Notification,
  NotificationFilter,
  PrDetail,
  PrRisk,
  PrSummary,
  PublicPost,
  Repo,
  Session,
  TriageItem,
  TriageLane,
  User,
  UserSettings,
} from "../types";
import { AI_CONSENT_VERSION } from "../config/consent";
import { getInMemoryCsrfToken, setInMemoryCsrfToken, type ApiClient } from "./client";
import {
  ApiClientError,
  type ClientErrorCode,
  codeFromStatus,
  messageForCode,
} from "./errors";
import {
  mapBillingPlan,
  mapHighlight,
  mapInstallations,
  mapPostSummary,
  mapPrDetail,
  secretWarningFromRisk,
} from "./mappers";
import { RepoWatchResponse, SupportReceived } from "./schemas";
import { CHECKOUT_HOSTS, githubUrl, httpsUrlOnHosts, PORTAL_HOSTS } from "./urls";

/** Where the session token lives on native. Web never has one: its session is an HttpOnly cookie. */
export interface TokenStore {
  get(): Promise<string | null>;
  set(token: string): Promise<void>;
  clear(): Promise<void>;
}

export interface HttpApiClientOptions {
  /** API origin without a path, e.g. `http://localhost:8787`. */
  baseUrl: string;
  /** `web` uses the cookie and CSRF token; `native` uses the bearer token. */
  platform: "web" | "native";
  tokenStore: TokenStore;
  fetch?: typeof fetch;
  timeoutMs?: number;
  /** Returns a Turnstile token for the demo and the support form. Throws when no bot check is available. */
  getTurnstileToken?: () => Promise<string>;
}

interface RequestOptions<T> {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  body?: unknown;
  form?: FormData;
  /** Parse the JSON body with this schema. Leave out for empty (204) answers. */
  schema?: z.ZodType<T>;
  /** Public endpoints skip the session. Default true. */
  auth?: boolean;
  /** A probe never raises the "session expired" handler (used to check whether anyone is signed in). */
  probe?: boolean;
  timeoutMs?: number;
  /** The session refresh itself must not wait for the refresh it is part of. */
  isRefresh?: boolean;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const AI_TIMEOUT_MS = 60_000;
const MAX_NOTIFICATION_PAGES = 3;
const MAX_REPO_PAGES = 10;

const SAFE_METHODS = new Set(["GET", "HEAD"]);

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : undefined;
}

const enc = encodeURIComponent;

function prPath(owner: string, repo: string, number: number): string {
  if (!Number.isInteger(number) || number < 1) {
    throw new ApiClientError("validation_failed", messageForCode("validation_failed"));
  }
  return `/prs/${enc(owner)}/${enc(repo)}/${number}`;
}

export class HttpApiClient implements ApiClient {
  readonly isMock = false;

  private readonly baseUrl: string;
  private readonly web: boolean;
  private readonly store: TokenStore;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly turnstile?: () => Promise<string>;

  private unauthorizedHandler: (() => void) | null = null;
  private csrfLoading: Promise<string> | null = null;
  private refreshing: Promise<Session> | null = null;
  private settingsCache: UserSettings | null = null;
  private repoPrivacy = new Map<string, boolean>();

  constructor(options: HttpApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.web = options.platform === "web";
    this.store = options.tokenStore;
    // Bound so it can be called detached from the client, as browsers require.
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.turnstile = options.getTurnstileToken;
  }

  setUnauthorizedHandler(handler: (() => void) | null): void {
    this.unauthorizedHandler = handler;
  }

  // ---------------------------------------------------------------------------------------------
  // Transport
  // ---------------------------------------------------------------------------------------------

  private async request<T = void>(opts: RequestOptions<T>): Promise<T> {
    const res = await this.exchange(opts);
    if (!opts.schema) return undefined as T;
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw this.parseFailure(res);
    }
    const parsed = opts.schema.safeParse(json);
    if (!parsed.success) throw this.parseFailure(res);
    return parsed.data;
  }

  private parseFailure(res: Response): ApiClientError {
    return new ApiClientError("parse_failed", messageForCode("parse_failed"), {
      status: res.status,
      requestId: res.headers.get("x-request-id") ?? undefined,
    });
  }

  /** Sends the request and returns the OK response, or throws an ApiClientError. */
  private async exchange(opts: RequestOptions<unknown>): Promise<Response> {
    const method = opts.method ?? "GET";
    const authed = opts.auth !== false;
    const write = !SAFE_METHODS.has(method);
    let csrfRetried = false;
    let tokenRetried = false;

    for (;;) {
      // A refresh swaps the native token; wait for it so this request carries the new one.
      if (authed && !this.web && !opts.isRefresh && this.refreshing) await this.refreshing.catch(() => undefined);

      const headers: Record<string, string> = { accept: "application/json" };
      let body: BodyInit | undefined;
      if (opts.form) {
        body = opts.form;
      } else if (opts.body !== undefined) {
        headers["content-type"] = "application/json";
        body = JSON.stringify(opts.body);
      }

      let usedToken: string | null = null;
      let sentCsrf: string | null = null;
      if (authed) {
        if (this.web) {
          if (write) {
            sentCsrf = getInMemoryCsrfToken() ?? (await this.loadCsrf());
            headers["x-csrf-token"] = sentCsrf;
          }
        } else {
          usedToken = await this.store.get();
          if (!usedToken) {
            if (!opts.probe) this.unauthorizedHandler?.();
            throw new ApiClientError("unauthorized", messageForCode("unauthorized"));
          }
          headers.authorization = `Bearer ${usedToken}`;
        }
      }

      const res = await this.fetchWithTimeout(`${this.baseUrl}/v1${opts.path}`, {
        method,
        headers,
        body,
        // Web: the browser sends the HttpOnly session cookie. Native never uses cookies.
        credentials: this.web ? "include" : "omit",
      }, opts.timeoutMs);

      if (res.ok) return res;

      const error = await this.toError(res);

      if (error.code === "unauthorized" && authed) {
        if (!this.web && usedToken) {
          // Another request may have rotated the token while this one was in flight: retry once with it.
          const current = await this.store.get();
          if (current && current !== usedToken && !tokenRetried) {
            tokenRetried = true;
            continue;
          }
          await this.store.clear();
        }
        setInMemoryCsrfToken(null);
        if (!opts.probe) this.unauthorizedHandler?.();
        throw error;
      }

      // The API reports a missing or stale CSRF token as `csrf_invalid` (older APIs: `forbidden`). Fetch a
      // fresh one and try once more; if the token did not change the refusal is about something else, so show it.
      if (this.web && authed && write && (error.code === "csrf_invalid" || error.code === "forbidden") && !csrfRetried) {
        csrfRetried = true;
        setInMemoryCsrfToken(null);
        const fresh = await this.loadCsrf();
        if (fresh !== sentCsrf) continue;
      }

      throw error;
    }
  }

  private async fetchWithTimeout(url: string, init: RequestInit, timeoutMs?: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs ?? this.timeoutMs);
    try {
      return await this.fetchImpl(url, { ...init, signal: controller.signal });
    } catch (e) {
      if (controller.signal.aborted) {
        throw new ApiClientError("timeout", messageForCode("timeout"));
      }
      throw new ApiClientError("network", messageForCode("network"));
    } finally {
      clearTimeout(timer);
    }
  }

  private async toError(res: Response): Promise<ApiClientError> {
    const retryAfterSeconds = parseRetryAfter(res.headers.get("retry-after"));
    const ssoUrl = githubUrl(res.headers.get("x-sso-url")) ?? undefined;
    let code: ClientErrorCode = codeFromStatus(res.status);
    let serverMessage: unknown;
    let requestId = res.headers.get("x-request-id") ?? undefined;
    try {
      const parsed = ErrorBody.safeParse(await res.json());
      if (parsed.success) {
        code = parsed.data.error.code;
        serverMessage = parsed.data.error.message;
        requestId = parsed.data.error.requestId;
      }
    } catch {
      // Not JSON: fall back to the status code. The body is never shown.
    }
    return new ApiClientError(code, messageForCode(code, { retryAfterSeconds, serverMessage }), {
      status: res.status,
      retryAfterSeconds,
      requestId,
      ssoUrl,
    });
  }

  /** Fetches the CSRF token for the cookie session and keeps it in memory only. */
  private loadCsrf(): Promise<string> {
    if (!this.csrfLoading) {
      this.csrfLoading = this.request({ path: "/auth/csrf", schema: CsrfResponse })
        .then(({ csrfToken }) => {
          setInMemoryCsrfToken(csrfToken);
          return csrfToken;
        })
        .finally(() => {
          this.csrfLoading = null;
        });
    }
    return this.csrfLoading;
  }

  /**
   * Keeps what the client must hold (the bearer token on native, the CSRF token on web) and hands back
   * a session without either, so neither reaches screens or React state.
   */
  private async adoptSession(session: z.infer<typeof AuthCallbackResponse>["session"]): Promise<Session> {
    if (this.web) {
      if (session.csrfToken) setInMemoryCsrfToken(session.csrfToken);
    } else if (session.token) {
      await this.store.set(session.token);
    }
    return { expiresAt: session.expiresAt, ...(session.demo ? { demo: true as const } : {}) };
  }

  private get platformName(): "ios" | "web" {
    return this.web ? "web" : "ios";
  }

  // ---------------------------------------------------------------------------------------------
  // Health and auth
  // ---------------------------------------------------------------------------------------------

  async health() {
    const res = await this.request({ path: "/health", auth: false, schema: HealthResponse });
    return { ok: res.ok, version: res.version };
  }

  async startGithubAuth(platform: "ios" | "web", codeChallenge: string) {
    const res = await this.request({
      method: "POST",
      path: "/auth/github/start",
      auth: false,
      body: { codeChallenge, platform },
      schema: AuthStartResponse,
    });
    // Only ever send the person to GitHub's own authorize page.
    const authorizeUrl = githubUrl(res.authorizeUrl);
    if (!authorizeUrl) throw new ApiClientError("parse_failed", messageForCode("parse_failed"));
    return { authorizeUrl, state: res.state };
  }

  async completeGithubAuth(code: string, state: string, codeVerifier: string) {
    const res = await this.request({
      method: "POST",
      path: "/auth/github/callback",
      auth: false,
      body: { code, state, codeVerifier },
      schema: AuthCallbackResponse,
    });
    return { session: await this.adoptSession(res.session), user: res.user };
  }

  async startDemoSession() {
    if (!this.turnstile) throw new ApiClientError("bot_check_unavailable", messageForCode("bot_check_unavailable"));
    const turnstileToken = await this.turnstile();
    const res = await this.request({
      method: "POST",
      path: "/auth/demo",
      auth: false,
      body: { turnstileToken, platform: this.platformName },
      schema: DemoResponse,
    });
    return { session: await this.adoptSession(res.session), user: res.user };
  }

  /** Rotates the session token (native) or the cookie and CSRF token (web). Calls share one refresh. */
  refreshSession(): Promise<Session> {
    if (!this.refreshing) {
      const run = async () => {
        const res = await this.request({
          method: "POST",
          path: "/auth/refresh",
          schema: RefreshResponse,
          isRefresh: true,
        });
        return this.adoptSession(res.session);
      };
      this.refreshing = run().finally(() => {
        this.refreshing = null;
      });
    }
    return this.refreshing;
  }

  async getMe(): Promise<User> {
    return this.request({ path: "/me", schema: UserSchema, probe: true });
  }

  async getCsrfToken() {
    if (!this.web) throw new ApiClientError("not_found", messageForCode("not_found"));
    return { csrfToken: await this.loadCsrf() };
  }

  async logout(): Promise<void> {
    try {
      await this.request({ method: "POST", path: "/auth/logout", probe: true });
    } finally {
      await this.store.clear();
      setInMemoryCsrfToken(null);
      this.settingsCache = null;
    }
  }

  async deleteAccount(): Promise<void> {
    await this.request({ method: "DELETE", path: "/account" });
    await this.store.clear();
    setInMemoryCsrfToken(null);
    this.settingsCache = null;
  }

  // ---------------------------------------------------------------------------------------------
  // AI consent
  // ---------------------------------------------------------------------------------------------

  async getConsent() {
    const res = await this.request({ path: "/consent", schema: ConsentState });
    return { ai: { granted: res.ai.granted, version: res.ai.version } };
  }

  async setConsent(granted: boolean): Promise<void> {
    await this.request({
      method: "PUT",
      path: "/consent",
      body: { ai: { granted, version: AI_CONSENT_VERSION } },
      schema: ConsentState,
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Repositories and installations
  // ---------------------------------------------------------------------------------------------

  async getRepos(): Promise<Repo[]> {
    const repos: Repo[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < MAX_REPO_PAGES; page++) {
      const res: z.infer<typeof RepoPage> = await this.request({
        path: cursor ? `/repos?cursor=${enc(cursor)}` : "/repos",
        schema: RepoPage,
      });
      repos.push(...res.items);
      cursor = res.nextCursor;
      if (!cursor) break;
    }
    for (const repo of repos) this.repoPrivacy.set(repo.id, repo.private);
    return repos;
  }

  async toggleWatchRepo(id: string, watching: boolean): Promise<Repo> {
    const res = await this.request({
      method: "PUT",
      path: `/repos/${enc(id)}/watch`,
      body: { watching },
      schema: RepoWatchResponse,
    });
    return { id: res.id, fullName: res.fullName, private: this.repoPrivacy.get(res.id) ?? false, watching: res.watching };
  }

  async getOrgInstallations(): Promise<InstallationList> {
    return mapInstallations(await this.request({ path: "/me/installations", schema: InstallationListSchema }));
  }

  // ---------------------------------------------------------------------------------------------
  // Notifications
  // ---------------------------------------------------------------------------------------------

  async getNotifications(filter: NotificationFilter = "all"): Promise<Notification[]> {
    const items: Notification[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < MAX_NOTIFICATION_PAGES; page++) {
      const query: string = `filter=${enc(filter)}${cursor ? `&cursor=${enc(cursor)}` : ""}`;
      const res: z.infer<typeof NotificationPage> = await this.request({
        path: `/notifications?${query}`,
        schema: NotificationPage,
      });
      items.push(...res.items);
      cursor = res.nextCursor;
      if (!cursor) break;
    }
    return items;
  }

  async markNotificationDone(id: string): Promise<void> {
    await this.request({ method: "POST", path: `/notifications/${enc(id)}/done` });
  }

  async snoozeNotification(id: string, until: string): Promise<void> {
    await this.request({ method: "POST", path: `/notifications/${enc(id)}/snooze`, body: { until } });
  }

  async restoreNotification(id: string): Promise<void> {
    await this.request({ method: "POST", path: `/notifications/${enc(id)}/restore` });
  }

  // ---------------------------------------------------------------------------------------------
  // Pull requests
  // ---------------------------------------------------------------------------------------------

  async getPrMetadata(owner: string, repo: string, number: number): Promise<PrDetail> {
    return mapPrDetail(await this.request({ path: prPath(owner, repo, number), schema: PrDetailSchema }));
  }

  async getPrDetail(owner: string, repo: string, number: number): Promise<PrDetail> {
    const path = prPath(owner, repo, number);
    const contract = await this.request({ path, schema: PrDetailSchema });
    const detail = mapPrDetail(contract);

    // Summary and risk are separate AI calls. If one is unavailable the PR still opens, with a plain reason.
    const [summary, risk] = await Promise.allSettled([
      this.request({ method: "POST", path: `${path}/summary`, schema: PrSummarySchema, timeoutMs: AI_TIMEOUT_MS }),
      this.request({ method: "POST", path: `${path}/risk`, schema: PrRiskSchema, timeoutMs: AI_TIMEOUT_MS }),
    ]);
    if (summary.status === "fulfilled") detail.summary = summary.value;
    if (risk.status === "fulfilled") {
      detail.risk = risk.value;
      detail.secretWarning = secretWarningFromRisk(risk.value);
    }

    const failure = [summary, risk].find((r): r is PromiseRejectedResult => r.status === "rejected");
    if (failure) {
      const reason = failure.reason;
      if (reason instanceof ApiClientError && reason.code === "unauthorized") throw reason;
      detail.aiNotice =
        reason instanceof ApiClientError
          ? { code: reason.code, message: reason.message }
          : { code: "internal", message: messageForCode("internal") };
    }
    return detail;
  }

  getPrSummary(owner: string, repo: string, number: number): Promise<PrSummary> {
    return this.request({
      method: "POST",
      path: `${prPath(owner, repo, number)}/summary`,
      schema: PrSummarySchema,
      timeoutMs: AI_TIMEOUT_MS,
    });
  }

  getPrRisk(owner: string, repo: string, number: number): Promise<PrRisk> {
    return this.request({
      method: "POST",
      path: `${prPath(owner, repo, number)}/risk`,
      schema: PrRiskSchema,
      timeoutMs: AI_TIMEOUT_MS,
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Triage
  // ---------------------------------------------------------------------------------------------

  getTriageQueue(): Promise<TriageItem[]> {
    return this.request({ path: "/triage", schema: TriageQueue, timeoutMs: AI_TIMEOUT_MS });
  }

  async setTriageChoice(prRef: string, lane: TriageLane): Promise<void> {
    await this.request({
      method: "POST",
      path: `/triage/${enc(prRef)}`,
      body: { lane },
      schema: TriageRecord,
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Highlight
  // ---------------------------------------------------------------------------------------------

  async analyzeHighlight(imageUri: string, note?: string, mimeType?: string): Promise<HighlightResult> {
    const form = new FormData();
    const type = mimeType ?? "image/jpeg";
    if (this.web) {
      // On the web the picked image is a blob or data URL the browser can read back.
      let blob: Blob;
      try {
        blob = await (await this.fetchImpl(imageUri)).blob();
      } catch {
        throw new ApiClientError("validation_failed", "We couldn't read that image. Pick it again.");
      }
      form.append("image", blob, "highlight");
    } else {
      // React Native uploads a file by uri; the field shape below is how it reads the file.
      form.append("image", { uri: imageUri, name: "highlight", type } as unknown as Blob);
    }
    const trimmed = note?.trim();
    if (trimmed) form.append("note", trimmed);

    const res = await this.request({
      method: "POST",
      path: "/highlight",
      form,
      schema: HighlightResultSchema,
      timeoutMs: AI_TIMEOUT_MS,
    });
    return mapHighlight(res);
  }

  // ---------------------------------------------------------------------------------------------
  // Settings, push and Meta key
  // ---------------------------------------------------------------------------------------------

  async getSettings(): Promise<UserSettings> {
    this.settingsCache = await this.request({ path: "/settings", schema: SettingsSchema });
    return this.settingsCache;
  }

  async updateSettings(settings: Partial<UserSettings>): Promise<UserSettings> {
    const current = this.settingsCache ?? (await this.getSettings());
    // The API takes the full object, so merge the change into what is stored.
    const merged: UserSettings = {
      ...current,
      ...settings,
      notifications: { ...current.notifications, ...settings.notifications },
    };
    this.settingsCache = await this.request({
      method: "PUT",
      path: "/settings",
      body: merged,
      schema: SettingsSchema,
    });
    return this.settingsCache;
  }

  async registerPushToken(deviceId: string, token: string): Promise<void> {
    await this.request({
      method: "POST",
      path: "/push/tokens",
      body: { deviceId, token },
      schema: PushTokenRegistered,
    });
  }

  async unregisterPushToken(deviceId: string): Promise<void> {
    await this.request({ method: "DELETE", path: "/push/tokens", body: { deviceId } });
  }

  async getMetaKeyStatus(): Promise<{ configured: boolean } | null> {
    try {
      const res = await this.request({ path: "/settings/meta-key", schema: MetaKeyStatus });
      return { configured: res.configured };
    } catch (e) {
      // An API without the feature answers not_found; the settings row is simply left out.
      if (e instanceof ApiClientError && e.code === "not_found") return null;
      throw e;
    }
  }

  async saveMetaKey(key: string): Promise<void> {
    if (!this.web) throw new ApiClientError("forbidden", "Add your Meta key in the web app.");
    const body = MetaKeyInput.safeParse({ key: key.trim() });
    if (!body.success) {
      throw new ApiClientError("validation_failed", "That doesn't look like a Meta key. Check it and try again.");
    }
    await this.request({ method: "PUT", path: "/settings/meta-key", body: body.data, schema: MetaKeyStatus });
  }

  async removeMetaKey(): Promise<void> {
    if (!this.web) throw new ApiClientError("forbidden", "Manage your Meta key in the web app.");
    await this.request({ method: "DELETE", path: "/settings/meta-key" });
  }

  // ---------------------------------------------------------------------------------------------
  // Billing (checkout and portal are web only)
  // ---------------------------------------------------------------------------------------------

  async getBillingPlan(): Promise<BillingPlan> {
    return mapBillingPlan(await this.request({ path: "/billing/plan", schema: BillingPlanSchema }));
  }

  async createCheckoutSession(priceKey: "pro_monthly" | "pro_annual") {
    return this.billingLink("/billing/checkout", CHECKOUT_HOSTS, { priceKey });
  }

  async createPortalSession() {
    return this.billingLink("/billing/portal", PORTAL_HOSTS);
  }

  private async billingLink(path: string, hosts: readonly string[], body?: unknown): Promise<{ url: string }> {
    if (!this.web) throw new ApiClientError("forbidden", "Manage your plan in the web app.");
    const res = await this.request({ method: "POST", path, body, schema: BillingLink });
    // Only Stripe's own pages may be opened.
    const url = httpsUrlOnHosts(res.url, hosts);
    if (!url) throw new ApiClientError("parse_failed", messageForCode("parse_failed"));
    return { url };
  }

  // ---------------------------------------------------------------------------------------------
  // Public content
  // ---------------------------------------------------------------------------------------------

  async getPublicPosts(type: "news" | "changelog"): Promise<PublicPost[]> {
    const res = await this.request({ path: `/public/posts?type=${enc(type)}`, auth: false, schema: PostList });
    return res.items.map(mapPostSummary);
  }

  async sendSupportMessage(email: string, message: string): Promise<void> {
    if (!this.turnstile) throw new ApiClientError("bot_check_unavailable", messageForCode("bot_check_unavailable"));
    const turnstileToken = await this.turnstile();
    await this.request({
      method: "POST",
      path: "/public/support",
      auth: false,
      body: { email: email.trim(), message, turnstileToken },
      schema: SupportReceived,
    });
  }
}
