import {FeatureFlagCache} from "./feature-flags";
import {notifySessionChange,hasPendingLogout,setPendingLogout} from "../auth/session-events";
import { z } from "zod";
import { RequestCache } from "./request-cache";
import {
  InboxPreference,InboxMutation,InboxReceipt,
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
  Post,
  PostSlug,
  PrDetail as PrDetailSchema,
  PrFile as PrFileSchema,
  PrThread as PrThreadSchema,
  PrRisk as PrRiskSchema,
  PrSummary as PrSummarySchema,
  PushTokenRegistered,
  WebPushKey,
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
  mapFile,
  mapComments,
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
  nativePlatform?: "ios" | "android";
  tokenStore: TokenStore;
  fetch?: typeof fetch;
  timeoutMs?: number;
  /** Returns a Turnstile token for the demo and the support form. Throws when no bot check is available. */
  getTurnstileToken?: () => Promise<string>;
}

interface RequestOptions<T> {
  credentials?: "omit";
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
  sessionMutation?: boolean;
  allowStaleSession?: boolean;
  sessionGeneration?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const AI_TIMEOUT_MS = 60_000;

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
  private readonly nativePlatform: "ios" | "android";
  private sessionGeneration=0;
  private sessionOperations=Promise.resolve();
  private readonly store: TokenStore;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly turnstile?: () => Promise<string>;

  private unauthorizedHandler: (() => void) | null = null;
  private csrfLoading: Promise<string> | null = null;
  private refreshing: Promise<Session> | null = null;
  private settingsCache: UserSettings | null = null;
  private reads = new RequestCache();
  private actions = new RequestCache();

  invalidateSession():void{++this.sessionGeneration;this.clearCache();setInMemoryCsrfToken(null);this.csrfLoading=null;}
  invalidateCache(): void { this.featureFlags.clear(); this.reads.invalidate(); }
  clearCache(): void { this.featureFlags.clear(); this.reads.clear(); this.actions.clear(); this.settingsCache = null; this.repoPrivacy.clear(); }
  private repoPrivacy = new Map<string, boolean>();

  constructor(options: HttpApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.web = options.platform === "web";
    this.nativePlatform=options.nativePlatform??"ios";
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

  private request<T = void>(opts: RequestOptions<T>): Promise<T> {
    opts={...opts,sessionGeneration:opts.sessionGeneration??this.sessionGeneration};
    if ((opts.method ?? 'GET') === 'GET') {
      return this.reads.run(`get:${opts.auth !== false}:${!!opts.probe}:${!!opts.sessionMutation}:${opts.path}`, () => this.readRequest(opts));
    }
    return this.readRequest(opts).then(value=>{
      if(/^\/(settings|consent|repos|account|inbox)(\/|$)/.test(opts.path))this.reads.invalidate();
      return value;
    });
  }

  private async readRequest<T = void>(opts: RequestOptions<T>): Promise<T> {
    const res = await this.exchange(opts);
    if (!opts.schema) return undefined as T;
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw this.parseFailure(res);
    }
    if(opts.auth!==false && !opts.allowStaleSession && opts.sessionGeneration!==this.sessionGeneration)throw new ApiClientError("unauthorized",messageForCode("unauthorized"));
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
    const generation=opts.sessionGeneration??this.sessionGeneration;
    const write = !SAFE_METHODS.has(method);
    let csrfRetried = false;
    let tokenRetried = false;

    for (;;) {
      // A refresh swaps the native token; wait for it so this request carries the new one.
      if (authed && !opts.isRefresh && !opts.sessionMutation && this.refreshing) await this.refreshing.catch(() => undefined);

      if(authed && !opts.allowStaleSession && generation!==this.sessionGeneration)throw new ApiClientError("unauthorized",messageForCode("unauthorized"));
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
            sentCsrf = getInMemoryCsrfToken() ?? (await this.loadCsrf(!!(opts.sessionMutation || opts.isRefresh)));
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

      const deliver=()=>{
      if(authed && !opts.allowStaleSession && generation!==this.sessionGeneration)throw new ApiClientError("unauthorized",messageForCode("unauthorized"));
      return this.fetchWithTimeout(`${this.baseUrl}/v1${opts.path}`, {
        method,
        headers,
        body,
        // Web: the browser sends the HttpOnly session cookie. Native never uses cookies.
        credentials: opts.credentials ?? (this.web ? "include" : "omit"),
      }, opts.timeoutMs);};
      const res=authed && !opts.sessionMutation && !opts.isRefresh ? await this.withCookieLock("shared",deliver) : await deliver();

      if(authed && !opts.allowStaleSession && generation!==this.sessionGeneration)throw new ApiClientError("unauthorized",messageForCode("unauthorized"));
      if (res.ok) return res;

      const error = await this.toError(res);

      if (error.code === "unauthorized" && authed && generation===this.sessionGeneration) {
        if (!this.web && usedToken) {
          // Another request may have rotated the token while this one was in flight: retry once with it.
          const current = await this.store.get();
          if (current && current !== usedToken && !tokenRetried) {
            tokenRetried = true;
            continue;
          }
          await this.store.clear();
        }
        this.clearCache();
        setInMemoryCsrfToken(null);
        if (!opts.probe) this.unauthorizedHandler?.();
        throw error;
      }

      // The API reports a missing or stale CSRF token as `csrf_invalid` (older APIs: `forbidden`). Fetch a
      // fresh one and try once more; if the token did not change the refusal is about something else, so show it.
      if (this.web && authed && write && (error.code === "csrf_invalid" || error.code === "forbidden") && !csrfRetried) {
        csrfRetried = true;
        setInMemoryCsrfToken(null);
        const fresh = await this.loadCsrf(!!(opts.sessionMutation || opts.isRefresh));
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
  private loadCsrf(sessionMutation=false):Promise<string>{
    // An exclusive cookie mutation must never await a shared lock queued behind itself.
    if(sessionMutation)return this.request({path:"/auth/csrf",schema:CsrfResponse,sessionMutation:true}).then(({csrfToken})=>{setInMemoryCsrfToken(csrfToken);return csrfToken;});
    if(!this.csrfLoading){
      const pending=this.request({path:"/auth/csrf",schema:CsrfResponse}).then(({csrfToken})=>{setInMemoryCsrfToken(csrfToken);return csrfToken;}).finally(()=>{if(this.csrfLoading===pending)this.csrfLoading=null;});
      this.csrfLoading=pending;
    }
    return this.csrfLoading;
  }

  /**
   * Keeps what the client must hold (the bearer token on native, the CSRF token on web) and hands back
   * a session without either, so neither reaches screens or React state.
   */
  private async adoptSession(session: z.infer<typeof AuthCallbackResponse>["session"], newSession = true, generation=this.sessionGeneration): Promise<Session> {
    if(generation!==this.sessionGeneration)throw new ApiClientError("unauthorized",messageForCode("unauthorized"));
    if(this.web ? !!session.token || !session.csrfToken : !session.token || !!session.csrfToken)throw new ApiClientError("parse_failed",messageForCode("parse_failed"));
    if(newSession)this.clearCache();
    if (this.web) {
      if (session.csrfToken) setInMemoryCsrfToken(session.csrfToken);
    } else if (session.token) {
      await this.store.set(session.token);
    }
    if(generation!==this.sessionGeneration)throw new ApiClientError("unauthorized",messageForCode("unauthorized"));
    return { expiresAt: session.expiresAt, ...(session.demo ? { demo: true as const } : {}) };
  }

  private get platformName(): "ios" | "android" | "web" {
    return this.web ? "web" : this.nativePlatform;
  }

  // ---------------------------------------------------------------------------------------------
  // Health and auth
  // ---------------------------------------------------------------------------------------------

  async health() {
    const res = await this.request({ path: "/health", auth: false, schema: HealthResponse });
    return { ok: res.ok, version: res.version };
  }

  async startGithubAuth(platform: "ios" | "android" | "web", codeChallenge: string) {
    ++this.sessionGeneration;this.clearCache();
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

  private async withCookieLock<T>(mode:"shared"|"exclusive",operation:()=>Promise<T>):Promise<T>{
    if(this.web && typeof navigator!=="undefined" && navigator.locks)return await navigator.locks.request(`mergemate-session:${this.baseUrl}`,{mode},operation);
    return operation();
  }
  private mutateSession<T>(operation:()=>Promise<T>):Promise<T>{
    const run=()=>this.withCookieLock("exclusive",operation);
    const result=this.sessionOperations.then(run,run);
    this.sessionOperations=result.then(()=>undefined,()=>undefined);return result;
  }

  private async finishPendingCookieLogout(generation:number){
    if(!this.web || !hasPendingLogout())return;
    try{await this.request({method:"POST",path:"/auth/logout",probe:true,sessionMutation:true,sessionGeneration:generation});}
    catch(error){if(!(error instanceof ApiClientError && error.code==='unauthorized'))throw error;}
    setPendingLogout(false);setInMemoryCsrfToken(null);this.csrfLoading=null;
  }

  completeGithubAuth(code:string,state:string,codeVerifier:string){
    const generation=++this.sessionGeneration;this.clearCache();
    return this.mutateSession(async()=>{
      if(generation!==this.sessionGeneration)throw new ApiClientError("unauthorized",messageForCode("unauthorized"));
      await this.finishPendingCookieLogout(generation);
      const res=await this.request({method:"POST",path:"/auth/github/callback",auth:false,body:{code,state,codeVerifier},schema:AuthCallbackResponse});
      const session=await this.adoptSession(res.session,true,generation);if(this.web)setPendingLogout(false);notifySessionChange("signed-in");return {session,user:res.user};
    });
  }

  startDemoSession(){
    const generation=++this.sessionGeneration;this.clearCache();
    return this.mutateSession(async()=>{
      if(generation!==this.sessionGeneration)throw new ApiClientError("unauthorized",messageForCode("unauthorized"));
      if(!this.turnstile)throw new ApiClientError("bot_check_unavailable",messageForCode("bot_check_unavailable"));
      await this.finishPendingCookieLogout(generation);
      const turnstileToken=await this.turnstile();
      if(generation!==this.sessionGeneration)throw new ApiClientError("unauthorized",messageForCode("unauthorized"));
      const res=await this.request({method:"POST",path:"/auth/demo",auth:false,body:{turnstileToken,platform:this.platformName},schema:DemoResponse});
      const session=await this.adoptSession(res.session,true,generation);if(this.web)setPendingLogout(false);notifySessionChange("signed-in");return {session,user:res.user};
    });
  }

  refreshSession():Promise<Session>{
    if(!this.refreshing){
      const generation=this.sessionGeneration;
      const request=this.mutateSession(async()=>{
        if(generation!==this.sessionGeneration)throw new ApiClientError("unauthorized",messageForCode("unauthorized"));
        const res=await this.request({method:"POST",path:"/auth/refresh",schema:RefreshResponse,isRefresh:true,sessionGeneration:generation});
        return this.adoptSession(res.session,false,generation);
      });
      const pending=request.finally(()=>{if(this.refreshing===pending)this.refreshing=null;});
      this.refreshing=pending;
    }
    return this.refreshing;
  }

  private readonly featureFlags=new FeatureFlagCache(()=>this.request({path:"/flags",auth:false,credentials:"omit",schema:z.unknown()}));
  getFeatureFlags(refresh=false){if(refresh)this.featureFlags.clear();return this.featureFlags.get();}

  async getMe(): Promise<User & {demo?:boolean}> {
    return this.request({ path: "/me", schema: UserSchema.extend({demo:z.boolean().optional()}), probe: true });
  }

  async getCsrfToken() {
    if (!this.web) throw new ApiClientError("not_found", messageForCode("not_found"));
    return { csrfToken: await this.loadCsrf() };
  }

  logout():Promise<void>{
    const generation=++this.sessionGeneration;this.clearCache();
    return this.mutateSession(async()=>{
      if(this.web){setPendingLogout(true);notifySessionChange("signed-out");}
      try{await this.request({method:"POST",path:"/auth/logout",probe:true,sessionMutation:true,allowStaleSession:true,sessionGeneration:generation});if(this.web)setPendingLogout(false);}
      catch(error){if(error instanceof ApiClientError && error.code==='unauthorized'){if(this.web)setPendingLogout(false);return;}throw error;}
      finally{await this.store.clear();setInMemoryCsrfToken(null);this.csrfLoading=null;this.clearCache();notifySessionChange("signed-out");}
    });
  }

  deleteAccount():Promise<void>{
    const generation=++this.sessionGeneration;this.clearCache();
    return this.mutateSession(async()=>{
      await this.request({method:"DELETE",path:"/account",sessionMutation:true,sessionGeneration:generation});
      await this.store.clear();setInMemoryCsrfToken(null);this.csrfLoading=null;this.clearCache();notifySessionChange("signed-out");
    });
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

  async getRepoPage(cursor?: string | null): Promise<{items: Repo[]; nextCursor: string | null}> {
    const page = await this.request({path: cursor ? `/repos?cursor=${enc(cursor)}` : '/repos', schema: RepoPage});
    for (const repo of page.items) this.repoPrivacy.set(repo.id, repo.private);
    return page;
  }

  async getRepos(): Promise<Repo[]> { return (await this.getRepoPage()).items; }

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

  getInboxPreference(){return this.request({path:'/inbox/preference',schema:InboxPreference});}
  async setInboxPreference(filter:NotificationFilter){return this.request({method:'PUT',path:'/inbox/preference',body:{filter},schema:InboxPreference});}
  async mutateInboxItem(id:string,input:import('@mergemate/contracts').InboxMutation){
    const body=InboxMutation.parse(input);
    const receipt=await this.actions.run(`inbox-operation:${id}:${body.operationId}`,()=>this.request({method:'POST',path:`/notifications/${enc(id)}/state`,body,schema:InboxReceipt}));
    this.reads.invalidate('inbox:');return receipt;
  }

  getNotificationPage(filter: NotificationFilter = 'all', cursor?: string | null, search = ''): Promise<{items: Notification[]; nextCursor: string | null;serverTime?:string;refreshAt?:string|null}> {
    const path = `/notifications?filter=${enc(filter)}${cursor ? `&cursor=${enc(cursor)}` : ''}${search ? `&search=${enc(search)}` : ''}`;
    return this.reads.run(`inbox:${path}`, () => this.request({path, schema: NotificationPage}), 15_000);
  }

  async getNotifications(filter: NotificationFilter = 'all'): Promise<Notification[]> {
    return (await this.getNotificationPage(filter)).items;
  }

  async markNotificationDone(id: string, observedUpdatedAt?: string): Promise<void> {
    await this.actions.run(`done:${id}`, () => this.request({ method: "POST", path: `/notifications/${enc(id)}/done`, ...(observedUpdatedAt?{body:{observedUpdatedAt}}:{}) }));
    this.reads.invalidate("inbox:");
  }

  async snoozeNotification(id: string, until: string): Promise<void> {
    await this.actions.run(`snooze:${id}:${until}`, () => this.request({ method: "POST", path: `/notifications/${enc(id)}/snooze`, body: { until } }));
    this.reads.invalidate("inbox:");
  }

  async restoreNotification(id: string): Promise<void> {
    await this.actions.run(`restore:${id}`, () => this.request({ method: "POST", path: `/notifications/${enc(id)}/restore` }));
    this.reads.invalidate("inbox:");
  }

  // ---------------------------------------------------------------------------------------------
  // Pull requests
  // ---------------------------------------------------------------------------------------------

  async getPrFilePage(owner: string, repo: string, number: number, cursor?: string | null) {
    const page=await this.request({path:`${prPath(owner,repo,number)}/pages/files${cursor?`?cursor=${enc(cursor)}`:''}`,schema:z.object({items:z.array(PrFileSchema),nextCursor:z.string().nullable()})});
    return {items:page.items.map(mapFile),nextCursor:page.nextCursor};
  }

  async getPrCommentPage(owner: string, repo: string, number: number, cursor?: string | null) {
    const page=await this.request({path:`${prPath(owner,repo,number)}/pages/comments${cursor?`?cursor=${enc(cursor)}`:''}`,schema:z.object({items:z.array(PrThreadSchema),nextCursor:z.string().nullable()})});
    return {items:mapComments(page.items).map(comment=>({...comment,id:`${cursor?.split(':')[0] ?? 'review'}:${comment.id}`})),nextCursor:page.nextCursor};
  }

  async getPrMetadata(owner: string, repo: string, number: number): Promise<PrDetail> {
    return mapPrDetail(await this.request({ path: `${prPath(owner, repo, number)}?lazy=1`, schema: PrDetailSchema }));
  }

  async getPrDetail(owner: string, repo: string, number: number): Promise<PrDetail> {
    return this.reads.run(`detail:${prPath(owner, repo, number)}`, () => this.loadPrDetail(owner, repo, number), 30_000);
  }

  private async loadPrDetail(owner: string, repo: string, number: number): Promise<PrDetail> {
    const path = prPath(owner, repo, number);
    const contract = await this.request({ path: `${path}?lazy=1`, schema: PrDetailSchema });
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

  async undoTriageChoice(prRef: string): Promise<void> {
    await this.actions.run(`undo:${prRef}`,()=>this.request({method:'DELETE',path:`/triage/${enc(prRef)}`}));
  }

  async setTriageChoice(prRef: string, lane: TriageLane): Promise<void> {
    await this.actions.run(`triage:${prRef}:${lane}`, () => this.request({
      method: "POST",
      path: `/triage/${enc(prRef)}`,
      body: { lane },
      schema: TriageRecord,
    }));
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

  async getWebPushKey(): Promise<string | null> {
    try {
      return (await this.request({ path: "/push/web-key", schema: WebPushKey })).publicKey;
    } catch (e) {
      // An API without the feature (or without a key configured) answers not_found; the settings row is left out.
      if (e instanceof ApiClientError && e.code === "not_found") return null;
      throw e;
    }
  }

  async registerWebPush(deviceId: string, subscription: { endpoint: string; keys: { p256dh: string; auth: string } }): Promise<void> {
    await this.request({ method: "POST", path: "/push/web", body: { deviceId, ...subscription }, schema: PushTokenRegistered });
  }

  async unregisterWebPush(deviceId: string): Promise<void> {
    await this.request({ method: "DELETE", path: "/push/web", body: { deviceId } });
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
    return (await this.getPublicPostPage(type)).items;
  }

  async getPublicPostPage(type:"news"|"changelog",cursor?:string|null):Promise<{items:PublicPost[];nextCursor:string|null}> {
    if(cursor && (!/^\d+$/.test(cursor) || Number(cursor)>10_000))throw new ApiClientError("validation_failed",messageForCode("validation_failed"));
    const res=await this.request({path:`/public/posts?type=${enc(type)}${cursor?`&cursor=${enc(cursor)}`:''}`,auth:false,schema:PostList});
    if(res.nextCursor!==null && (!/^\d+$/.test(res.nextCursor) || Number(res.nextCursor)<=Number(cursor??0) || Number(res.nextCursor)>10_000))throw new ApiClientError("parse_failed",messageForCode("parse_failed"));
    const seen=new Set<string>();
    return {items:res.items.filter(post=>{if(seen.has(post.slug))return false;seen.add(post.slug);return true;}).map(mapPostSummary),nextCursor:res.nextCursor};
  }

  async getPublicPost(slug:string):Promise<PublicPost> {
    if(!PostSlug.safeParse(slug).success)throw new ApiClientError("not_found",messageForCode("not_found"));
    const post=await this.request({path:`/public/posts/${enc(slug)}`,auth:false,schema:Post});
    if(post.slug!==slug)throw new ApiClientError("parse_failed",messageForCode("parse_failed"));
    return mapPostSummary(post);
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
