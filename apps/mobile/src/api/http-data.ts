import {PrVisualAsset} from "@mergemate/contracts";
import { PrSearchFilters, PrSearchPage } from '@mergemate/contracts';
import type { WorkspaceRead } from './client';
import { PrCheck as PrCheckSchema } from '@mergemate/contracts';
import { z } from "zod";
import { PrivateNotes, PrivateNote, VoiceNoteResult, SavePrivateNote, type NoteContext, InboxPreference, InboxMutation, InboxReceipt, InboxUndo, ConsentState, AiPreferences, type AiPreferenceUpdate, HighlightResult as HighlightResultSchema, InstallationList as InstallationListSchema, NotificationPage, PrDetail as PrDetailSchema, PrFile as PrFileSchema, PrThread as PrThreadSchema, PrRisk as PrRiskSchema, PrSummary as PrSummarySchema, ReviewPlan as ReviewPlanSchema, AiEngineInfo as AiEngineInfoSchema, PrAnswer as PrAnswerSchema, RepoPage, TriageQueue, TriageRecord } from "@mergemate/contracts";
import type { HighlightResult, InstallationList, Notification, NotificationFilter, AiEngineInfo, PrAnswer, PrDetail, PrRisk, PrSummary, Repo, ReviewPlan, TriageItem, TriageLane } from "../types";
import { AI_CONSENT_VERSION } from "../config/consent";
import { ApiClientError, messageForCode } from "./errors";
import { mapHighlight, mapInstallations, mapPrDetail, mapFile, mapCheck, mapComments, secretWarningFromRisk } from "./mappers";
import { RepoWatchResponse } from "./schemas";
import { AI_TIMEOUT_MS, enc, prPath } from "./http-types";
import { HttpSession } from "./http-session";

export abstract class HttpData extends HttpSession {
  getPrVisualAsset(owner:string,repo:string,number:number,path:string,side:"before"|"after",headSha?:string,signal?:AbortSignal){const q=new URLSearchParams({path,side,...(headSha?{headSha}:{})});return this.request({path:prPath(owner,repo,number)+"/visual?"+q.toString(),schema:PrVisualAsset,signal});}

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

  async getAiPreferences() {
    return this.request({ path: "/consent/preferences", schema: AiPreferences });
  }

  async updateAiPreferences(update: AiPreferenceUpdate) {
    return this.request({ method: "PUT", path: "/consent/preferences", body: update, schema: AiPreferences });
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

  getInboxUndo(){return this.request({path:"/inbox/undo",schema:InboxUndo});}
  getInboxPreference(){return this.request({path:'/inbox/preference',schema:InboxPreference});}
  async setInboxPreference(filter:NotificationFilter){return this.request({method:'PUT',path:'/inbox/preference',body:{filter},schema:InboxPreference});}
  async mutateInboxItem(id:string,input:import('@mergemate/contracts').InboxMutation){
    const body=InboxMutation.parse(input);
    const receipt=await this.actions.run(`inbox-operation:${id}:${body.operationId}`,()=>this.request({method:'POST',path:`/notifications/${enc(id)}/state`,body,schema:InboxReceipt}));
    this.reads.invalidate('inbox:');return receipt;
  }

  async searchPrs(filters:PrSearchFilters,cursor?:string|null,signal?:AbortSignal){
    const parsed=PrSearchFilters.parse(filters),params=new URLSearchParams();for(const [key,value] of Object.entries(parsed))if(value)params.set(key,value);if(cursor)params.set('cursor',cursor);
    return this.request({path:'/search/prs?'+params.toString(),schema:PrSearchPage,signal});
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

  protected workspacePagePath(owner:string,repo:string,number:number,section:string,cursor?:string|null,options?:WorkspaceRead){return `${prPath(owner,repo,number)}/pages/${section}?v=2${cursor?`&cursor=${enc(cursor)}`:''}${options?.headSha?`&head=${enc(options.headSha)}`:''}`;}
  async getPrFilePage(owner:string,repo:string,number:number,cursor?:string|null,options?:WorkspaceRead){
    const page=await this.request({path:this.workspacePagePath(owner,repo,number,'files',cursor,options),signal:options?.signal,schema:z.object({items:z.array(PrFileSchema),nextCursor:z.string().nullable(),headSha:z.string().optional(),capped:z.boolean().optional()})});return {...page,items:page.items.map(mapFile)};
  }
  async getPrCommentPage(owner:string,repo:string,number:number,cursor?:string|null,options?:WorkspaceRead){
    const page=await this.request({path:this.workspacePagePath(owner,repo,number,'comments',cursor,options),signal:options?.signal,schema:z.object({items:z.array(PrThreadSchema),nextCursor:z.string().nullable(),headSha:z.string().optional(),capped:z.boolean().optional()})});return {...page,items:mapComments(page.items)};
  }
  async getPrCheckPage(owner:string,repo:string,number:number,cursor?:string|null,options?:WorkspaceRead){
    const page=await this.request({path:this.workspacePagePath(owner,repo,number,'checks',cursor,options),signal:options?.signal,schema:z.object({items:z.array(PrCheckSchema),nextCursor:z.string().nullable(),headSha:z.string().optional(),capped:z.boolean().optional()})});return {...page,items:page.items.map(mapCheck)};
  }

  async getPrMetadata(owner: string, repo: string, number: number,signal?:AbortSignal,workspace=false): Promise<PrDetail> {
    return mapPrDetail(await this.request({ path: `${prPath(owner, repo, number)}?lazy=1${workspace?'&workspace=1':''}`,signal, schema: PrDetailSchema }));
  }

  async getPrDetail(owner: string, repo: string, number: number,signal?:AbortSignal): Promise<PrDetail> {
    if(signal)return this.loadPrDetail(owner,repo,number,signal);
    return this.reads.run(`detail:${prPath(owner, repo, number)}`, () => this.loadPrDetail(owner, repo, number), 30_000);
  }

  protected async loadPrDetail(owner: string, repo: string, number: number,signal?:AbortSignal): Promise<PrDetail> {
    const path = prPath(owner, repo, number);
    const contract = await this.request({ path: `${path}?lazy=1`,signal, schema: PrDetailSchema });
    const detail = mapPrDetail(contract);

    // Summary and risk are separate AI calls. If one is unavailable the PR still opens, with a plain reason.
    const [summary, risk] = await Promise.allSettled([
      this.request({ method: "POST", path: `${path}/summary`,signal, schema: PrSummarySchema, timeoutMs: AI_TIMEOUT_MS }),
      this.request({ method: "POST", path: `${path}/risk`,signal, schema: PrRiskSchema, timeoutMs: AI_TIMEOUT_MS }),
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

  getPrSummary(owner: string, repo: string, number: number,signal?:AbortSignal): Promise<PrSummary> {
    return this.request({
      method: "POST",
      path: `${prPath(owner, repo, number)}/summary`,signal,
      schema: PrSummarySchema,
      timeoutMs: AI_TIMEOUT_MS,
    });
  }

  async getAiEngine(): Promise<AiEngineInfo | null> {
    try {
      return await this.request({ path: "/ai/engine", schema: AiEngineInfoSchema });
    } catch (error) {
      if (error instanceof ApiClientError && error.code === "unauthorized") throw error;
      return null;
    }
  }

  getReviewPlan(owner: string, repo: string, number: number,signal?:AbortSignal): Promise<ReviewPlan> {
    return this.request({ method: "POST", path: `${prPath(owner, repo, number)}/plan`,signal, schema: ReviewPlanSchema, timeoutMs: AI_TIMEOUT_MS });
  }

  askPr(owner: string, repo: string, number: number, question: string,signal?:AbortSignal): Promise<PrAnswer> {
    return this.request({ method: "POST", path: `${prPath(owner, repo, number)}/ask`, body: { question },signal, schema: PrAnswerSchema, timeoutMs: AI_TIMEOUT_MS });
  }

  getPrRisk(owner: string, repo: string, number: number,signal?:AbortSignal): Promise<PrRisk> {
    return this.request({
      method: "POST",
      path: `${prPath(owner, repo, number)}/risk`,signal,
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

  async transcribeVoice(bytes:Uint8Array,signal?:AbortSignal):Promise<string>{
    return (await this.request({method:'POST',path:'/voice-notes',audio:new Uint8Array(bytes).buffer,schema:VoiceNoteResult,timeoutMs:AI_TIMEOUT_MS,...(signal?{signal}:{})})).text;
  }
  async getPrivateNotes(context:NoteContext){return (await this.request({path:`/notes?context=${enc(JSON.stringify(context))}`,schema:PrivateNotes})).items;}
  async savePrivateNote(input:import('@mergemate/contracts').SavePrivateNote){
    const body=SavePrivateNote.parse(input);
    return this.actions.run(`note:${body.id}`,()=>this.request({method:'POST',path:'/notes',body,schema:PrivateNote}));
  }
  async removePrivateNote(id:string,context:NoteContext){await this.request({method:'DELETE',path:`/notes/${enc(id)}?context=${enc(JSON.stringify(context))}`});}

  async analyzeHighlight(imageUri: string, note?: string, mimeType?: string,signal?:AbortSignal): Promise<HighlightResult> {
    const form = new FormData();
    const type = mimeType ?? "image/jpeg";
    if (this.web) {
      // On the web the picked image is a blob or data URL the browser can read back.
      let blob: Blob;
      try {
        blob = await (await this.fetchImpl(imageUri,{...(signal?{signal}:{})})).blob();
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
      ...(signal?{signal}:{}),
    });
    return mapHighlight(res);
  }
}
