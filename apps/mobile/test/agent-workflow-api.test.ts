import { afterEach, describe, expect, it, vi } from 'vitest';
import { setInMemoryCsrfToken } from '../src/api/client';
import { WorkflowApiClient } from '../src/workflows/api';
import { makeAgentTemplate, adoptRunUpdate } from '../src/workflows/agent-model';
import type { WorkflowRun } from '@mergemate/contracts';

const capabilities={analysis:{available:true},coding:{available:false,reason:'Runner not configured'},limits:{maxSteps:9,maxFiles:8,maxPatchBytes:60000},requiresAiConsent:true as const};
const target={owner:'owner',repo:'repo',number:7};
const definition=makeAgentTemplate('review',target);
function run(revision=1):WorkflowRun{return {id:'run_1',definition,status:'running',headSha:'a'.repeat(40),revision,createdAt:'2026-11-03T00:00:00Z',updatedAt:'2026-11-03T00:00:00Z',steps:definition.steps.map(step=>({id:step.id,kind:step.kind,title:step.title,status:'pending'})),capabilities};}
const store=()=>({get:vi.fn(async()=> 'native-session-fixture'),set:vi.fn(async()=>{}),clear:vi.fn(async()=>{})});
afterEach(()=>setInMemoryCsrfToken(null));
describe('workflow API transport',()=>{
 it('uses same-origin cookie/CSRF transport and preserves the idempotency key',async()=>{
  setInMemoryCsrfToken('csrf-fixture');
  const fetcher=vi.fn(async()=>Response.json(run()));const tokenStore=store();
  const client=new WorkflowApiClient({baseUrl:'/__api',platform:'web',tokenStore,fetch:fetcher});
  const result=await client.start({definition,idempotencyKey:'request_123'},new AbortController().signal);
  expect(result.id).toBe('run_1');
  const [url,init]=fetcher.mock.calls[0] as unknown as [string,RequestInit];
  expect(url).toBe('/__api/v1/workflows/runs');expect(init.credentials).toBe('include');
  expect(new Headers(init.headers).get('x-csrf-token')).toBe('csrf-fixture');
  expect(new Headers(init.headers).has('authorization')).toBe(false);
  expect(JSON.parse(String(init.body))).toMatchObject({idempotencyKey:'request_123',definition});expect(tokenStore.get).not.toHaveBeenCalled();
 });
 it('uses native bearer transport and encodes repository capability lookup',async()=>{
  const fetcher=vi.fn(async()=>Response.json(capabilities));
  const client=new WorkflowApiClient({baseUrl:'https://api.example.test',platform:'native',tokenStore:store(),fetch:fetcher});
  expect((await client.capabilities(target,new AbortController().signal)).coding.available).toBe(false);
  const [url,init]=fetcher.mock.calls[0] as unknown as [string,RequestInit];
  expect(url).toBe('https://api.example.test/v1/workflows/capabilities?repo=owner%2Frepo');expect(init.credentials).toBe('omit');expect(new Headers(init.headers).get('authorization')).toBe('Bearer native-session-fixture');
 });
 it('uses the protected passkey endpoints and preserves exact patch bindings',async()=>{
  setInMemoryCsrfToken('csrf-fixture');
  const patch={runId:'run_1',jobId:'job_1',repository:'owner/repo',repositoryId:101,headSha:'a'.repeat(40),patchHash:'b'.repeat(64),action:'qa_and_draft_pr',summary:'Update the guarded view.',changes:[{path:'apps/mobile/src/view.ts',content:'export const guarded=true;'}]};
  const fetcher=vi.fn(async(input:RequestInfo|URL,_init?:RequestInit)=>String(input).endsWith('/patch-proposal')?Response.json(patch):Response.json({challengeId:'123e4567-e89b-12d3-a456-426614174000',options:{challenge:'fixture'},binding:{jobId:'job_1',runId:'run_1',repositoryId:101,headSha:patch.headSha,patchHash:patch.patchHash,action:'qa_and_draft_pr'}}));
  const client=new WorkflowApiClient({baseUrl:'/__api',platform:'web',tokenStore:store(),fetch:fetcher});
  expect((await client.patchProposal('run_1',new AbortController().signal)).patchHash).toBe(patch.patchHash);
  const approval=await client.patchApprovalOptions('run_1',new AbortController().signal);expect(approval.binding).toMatchObject({runId:'run_1',patchHash:patch.patchHash});
  expect(fetcher.mock.calls.map(call=>String(call[0]))).toEqual(['/__api/v1/workflows/runs/run_1/patch-proposal','/__api/v1/workflows/runs/run_1/approval/options']);
  expect((fetcher.mock.calls[1]?.[1] as RequestInit).method).toBe('POST');expect(new Headers((fetcher.mock.calls[1]?.[1] as RequestInit).headers).get('x-csrf-token')).toBe('csrf-fixture');
 });
 it('rejects malformed runtime responses and does not invent successful execution',async()=>{
  const client=new WorkflowApiClient({baseUrl:'/__api',platform:'web',tokenStore:store(),fetch:vi.fn(async()=>Response.json({id:'run_1',status:'succeeded'}))});
  await expect(client.run('run_1',new AbortController().signal)).rejects.toMatchObject({code:'parse_failed'});
 });
 it('fences a response after session invalidation',async()=>{
  let complete!:(response:Response)=>void;
  const client=new WorkflowApiClient({baseUrl:'/__api',platform:'web',tokenStore:store(),fetch:vi.fn(()=>new Promise<Response>(resolve=>{complete=resolve;}))});
  const pending=client.run('run_1',new AbortController().signal);
  await new Promise(resolve=>setTimeout(resolve,0));client.invalidateSession();complete(Response.json(run()));
  await expect(pending).rejects.toMatchObject({code:'unauthorized'});
 });
 it('does not replace newer execution receipts with stale poll results',()=>{
  const current=run(5),stale=run(3);expect(adoptRunUpdate(current,stale)).toBe(current);expect(adoptRunUpdate(current,run(6)).revision).toBe(6);
 });
});
