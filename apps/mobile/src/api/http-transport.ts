import { FeatureFlagCache } from "./feature-flags";
import { z } from "zod";
import { RequestCache } from "./request-cache";
import { CsrfResponse, ErrorBody } from "@mergemate/contracts";
import type { Session, UserSettings } from "../types";
import { getInMemoryCsrfToken, setInMemoryCsrfToken } from "./client";
import { ApiClientError, type ClientErrorCode, codeFromStatus, messageForCode } from "./errors";
import { githubUrl } from "./urls";
import { DEFAULT_TIMEOUT_MS, SAFE_METHODS, parseRetryAfter, type HttpApiClientOptions, type RequestOptions, type TokenStore } from "./http-types";

export abstract class HttpTransport {
  readonly isMock = false;

  protected readonly baseUrl: string;
  protected readonly web: boolean;
  protected readonly nativePlatform: "ios" | "android";
  protected readonly onAccountDeleted?:()=>Promise<void>;
  protected sessionGeneration=0;
  protected sessionOperations=Promise.resolve();
  protected readonly store: TokenStore;
  protected readonly fetchImpl: typeof fetch;
  protected readonly timeoutMs: number;
  protected readonly turnstile?: () => Promise<string>;

  protected unauthorizedHandler: (() => void) | null = null;
  protected csrfLoading: Promise<string> | null = null;
  protected refreshing: Promise<Session> | null = null;
  protected settingsCache: UserSettings | null = null;
  protected reads = new RequestCache();
  protected actions = new RequestCache();

  invalidateSession():void{++this.sessionGeneration;this.clearCache();setInMemoryCsrfToken(null);this.csrfLoading=null;}
  invalidateInbox():void {this.reads.invalidate('inbox:');}
  invalidateCache(): void { this.featureFlags.clear(); this.reads.invalidate(); }
  clearCache(): void { this.featureFlags.clear(); this.reads.clear(); this.actions.clear(); this.settingsCache = null; this.repoPrivacy.clear(); }
  protected repoPrivacy = new Map<string, boolean>();

  constructor(options: HttpApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.web = options.platform === "web";
    this.nativePlatform=options.nativePlatform??"ios";
    this.onAccountDeleted=options.onAccountDeleted;
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

  protected request<T = void>(opts: RequestOptions<T>): Promise<T> {
    opts={...opts,sessionGeneration:opts.sessionGeneration??this.sessionGeneration};
    if ((opts.method ?? 'GET') === 'GET' && !opts.signal) {
      return this.reads.run(`get:${opts.auth !== false}:${!!opts.probe}:${!!opts.sessionMutation}:${opts.path}`, () => this.readRequest(opts));
    }
    return this.readRequest(opts).then(value=>{
      if(/^\/(settings|consent|repos|account|inbox)(\/|$)/.test(opts.path))this.reads.invalidate();
      return value;
    });
  }

  protected async readRequest<T = void>(opts: RequestOptions<T>): Promise<T> {
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

  protected parseFailure(res: Response): ApiClientError {
    return new ApiClientError("parse_failed", messageForCode("parse_failed"), {
      status: res.status,
      requestId: res.headers.get("x-request-id") ?? undefined,
    });
  }

  /** Sends the request and returns the OK response, or throws an ApiClientError. */
  protected async exchange(opts: RequestOptions<unknown>): Promise<Response> {
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
      if(opts.audio){headers["content-type"]="audio/wav";body=opts.audio;}else if (opts.form) {
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
        ...(opts.signal?{signal:opts.signal}:{}),
        credentials: opts.credentials ?? (this.web ? "include" : "omit"),
      }, opts.timeoutMs,opts.signal);};
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

  protected async fetchWithTimeout(url: string, init: RequestInit, timeoutMs?: number,signal?:AbortSignal): Promise<Response> {
    const controller = new AbortController();
    const caller = init.signal ?? signal ?? undefined;
    const timer = setTimeout(() => controller.abort(), timeoutMs ?? this.timeoutMs);
    // React Native's installed abort-controller has no AbortSignal.any().
    const cancel=()=>controller.abort();
    if(caller?.aborted)cancel();else caller?.addEventListener('abort',cancel,{once:true});
    try {
      return await this.fetchImpl(url, { ...init, signal: controller.signal });
    } catch (e) {
      if(caller?.aborted)throw new ApiClientError("cancelled",messageForCode("cancelled"));
      if (controller.signal.aborted) {
        throw new ApiClientError("timeout", messageForCode("timeout"));
      }
      throw new ApiClientError("network", messageForCode("network"));
    } finally {
      clearTimeout(timer);
      caller?.removeEventListener('abort',cancel);
    }
  }

  protected async toError(res: Response): Promise<ApiClientError> {
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
  protected loadCsrf(sessionMutation=false):Promise<string>{
    // An exclusive cookie mutation must never await a shared lock queued behind itself.
    if(sessionMutation)return this.request({path:"/auth/csrf",schema:CsrfResponse,sessionMutation:true}).then(({csrfToken})=>{setInMemoryCsrfToken(csrfToken);return csrfToken;});
    if(!this.csrfLoading){
      const pending=this.request({path:"/auth/csrf",schema:CsrfResponse}).then(({csrfToken})=>{setInMemoryCsrfToken(csrfToken);return csrfToken;}).finally(()=>{if(this.csrfLoading===pending)this.csrfLoading=null;});
      this.csrfLoading=pending;
    }
    return this.csrfLoading;
  }

  protected get platformName(): "ios" | "android" | "web" {
    return this.web ? "web" : this.nativePlatform;
  }

  protected async withCookieLock<T>(mode:"shared"|"exclusive",operation:()=>Promise<T>):Promise<T>{
    if(this.web && typeof navigator!=="undefined" && navigator.locks)return await navigator.locks.request(`mergemate-session:${this.baseUrl}`,{mode},operation);
    return operation();
  }

  protected readonly featureFlags=new FeatureFlagCache(()=>this.request({path:"/flags",auth:false,credentials:"omit",schema:z.unknown()}));
}
