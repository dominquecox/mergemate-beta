import { z } from 'zod';
import { WorkflowCapabilities, WorkflowDefinition, WorkflowRun, WorkflowPlanRequest, WorkflowRunRequest, type WorkflowTarget } from '@mergemate/contracts';
import { HttpTransport } from '../api/http-transport';
import type { HttpApiClientOptions } from '../api/http-types';

const WebAuthnResponse=z.object({id:z.string().min(1),rawId:z.string().min(1),type:z.literal('public-key'),response:z.record(z.string(),z.unknown()),clientExtensionResults:z.record(z.string(),z.unknown())}).passthrough();
const WebAuthnOptions=z.record(z.string(),z.unknown());
const PasskeyOptions=z.object({challengeId:z.string().uuid(),options:WebAuthnOptions});
export const PatchProposal=z.object({runId:z.string(),jobId:z.string(),repository:z.string(),repositoryId:z.number().int().positive(),headSha:z.string().regex(/^[a-f\d]{40}$/i),patchHash:z.string().regex(/^[a-f\d]{64}$/i),action:z.literal('qa_and_draft_pr'),summary:z.string(),changes:z.array(z.object({path:z.string(),content:z.string()}))});
export type PatchProposalValue=z.infer<typeof PatchProposal>;

/** Uses the same cookie/CSRF/native bearer, cancellation and session fences as the main API client. */
export class WorkflowApiClient extends HttpTransport {
  constructor(options: HttpApiClientOptions) { super(options); }
  definitions(signal: AbortSignal) {
    return this.request({ path:'/workflows/definitions', schema:z.object({ definitions:z.array(WorkflowDefinition.refine(value => !!value.id, 'Saved workflow requires an id')).max(20) }), signal });
  }
  saveDefinition(input: z.infer<typeof WorkflowDefinition>, signal: AbortSignal) {
    return this.request({ method:'POST', path:'/workflows/definitions', body:WorkflowDefinition.parse(input), schema:WorkflowDefinition.refine(value => !!value.id, 'Saved workflow requires an id'), signal });
  }
  deleteDefinition(id: string, signal: AbortSignal) {
    return this.request({ method:'DELETE', path:`/workflows/definitions/${encodeURIComponent(id)}`, schema:z.object({deleted:z.literal(true)}), signal });
  }
  capabilities(target: WorkflowTarget, signal: AbortSignal) {
    return this.request({ path: `/workflows/capabilities?repo=${encodeURIComponent(`${target.owner}/${target.repo}`)}`, schema: WorkflowCapabilities, signal });
  }
  plan(input: z.infer<typeof WorkflowPlanRequest>, signal: AbortSignal) {
    return this.request({ method:'POST', path:'/workflows/plan', body: WorkflowPlanRequest.parse(input), schema: WorkflowDefinition, signal, timeoutMs: 90_000 });
  }
  start(input: z.infer<typeof WorkflowRunRequest>, signal: AbortSignal) {
    return this.request({ method:'POST', path:'/workflows/runs', body: WorkflowRunRequest.parse(input), schema: WorkflowRun, signal });
  }
  runs(signal: AbortSignal) {
    return this.request({ path:'/workflows/runs', schema:z.object({ runs:z.array(WorkflowRun).max(100) }), signal });
  }
  run(id: string, signal: AbortSignal) {
    return this.request({ path:`/workflows/runs/${encodeURIComponent(id)}`, schema:WorkflowRun, signal });
  }
  cancel(id: string, signal: AbortSignal) {
    return this.request({ method:'POST', path:`/workflows/runs/${encodeURIComponent(id)}/cancel`, body:{}, schema:WorkflowRun, signal });
  }
  passkeyRegistrationOptions(signal:AbortSignal){return this.request({method:'POST',path:'/workflows/passkeys/registration/options',body:{},schema:PasskeyOptions,signal});}
  verifyPasskeyRegistration(challengeId:string,response:unknown,signal:AbortSignal){return this.request({method:'POST',path:'/workflows/passkeys/registration/verify',body:{challengeId,response:WebAuthnResponse.parse(response)},schema:z.object({registered:z.literal(true),credentialId:z.string()}),signal});}
  patchProposal(id:string,signal:AbortSignal){return this.request({path:`/workflows/runs/${encodeURIComponent(id)}/patch-proposal`,schema:PatchProposal,signal});}
  patchApprovalOptions(id:string,signal:AbortSignal){return this.request({method:'POST',path:`/workflows/runs/${encodeURIComponent(id)}/approval/options`,body:{},schema:PasskeyOptions.extend({binding:z.object({jobId:z.string(),runId:z.string(),repositoryId:z.number().int().positive(),headSha:z.string(),patchHash:z.string(),action:z.literal('qa_and_draft_pr')})}),signal});}
  approvePatch(id:string,challengeId:string,response:unknown,signal:AbortSignal){return this.request({method:'POST',path:`/workflows/runs/${encodeURIComponent(id)}/approval/verify`,body:{challengeId,response:WebAuthnResponse.parse(response)},schema:z.object({approved:z.literal(true),run:WorkflowRun}),signal});}
}
