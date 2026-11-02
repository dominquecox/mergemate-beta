import { notifySessionChange, hasPendingLogout, setPendingLogout } from "../auth/session-events";
import { z } from "zod";
import { AuthCallbackResponse, AuthStartResponse, DemoResponse, HealthResponse, RefreshResponse, User as UserSchema } from "@mergemate/contracts";
import type { Session, User } from "../types";
import { setInMemoryCsrfToken } from "./client";
import { ApiClientError, messageForCode } from "./errors";
import { githubUrl } from "./urls";
import { HttpTransport } from "./http-transport";

export abstract class HttpSession extends HttpTransport {
  /**
   * Keeps what the client must hold (the bearer token on native, the CSRF token on web) and hands back
   * a session without either, so neither reaches screens or React state.
   */
  protected async adoptSession(session: z.infer<typeof AuthCallbackResponse>["session"], newSession = true, generation=this.sessionGeneration): Promise<Session> {
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
      body: { codeChallenge, platform, ...(platform!=="web"?{nativeBrowser:true}:{}) },
      schema: AuthStartResponse,
    });
    // Only ever send the person to GitHub's own authorize page.
    const authorizeUrl = githubUrl(res.authorizeUrl);
    if (!authorizeUrl) throw new ApiClientError("parse_failed", messageForCode("parse_failed"));
    return { authorizeUrl, state: res.state };
  }

  protected mutateSession<T>(operation:()=>Promise<T>):Promise<T>{
    const run=()=>this.withCookieLock("exclusive",operation);
    const result=this.sessionOperations.then(run,run);
    this.sessionOperations=result.then(()=>undefined,()=>undefined);return result;
  }

  protected async finishPendingCookieLogout(generation:number){
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
      if(generation!==this.sessionGeneration)throw new ApiClientError('unauthorized',messageForCode('unauthorized'));
      // Once delivered for this identity, finish its cleanup before a queued new sign-in can adopt credentials.
      const response=await this.exchange({method:"DELETE",path:"/account",sessionMutation:true,sessionGeneration:generation,allowStaleSession:true});
      if(response.status!==204)throw new ApiClientError('parse_failed',messageForCode('parse_failed'),{status:response.status});
      const cleanup=await Promise.allSettled([this.store.clear(),this.onAccountDeleted?.()]);
      setInMemoryCsrfToken(null);this.csrfLoading=null;this.clearCache();notifySessionChange("signed-out");
      if(cleanup.some(result=>result.status==='rejected'))throw new ApiClientError('local_cleanup_incomplete',messageForCode('local_cleanup_incomplete'),{status:204});
    });
  }
}
