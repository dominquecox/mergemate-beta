import type { WorkflowCapabilities,WorkflowDefinition,WorkflowRun,WorkflowTarget } from '@mergemate/contracts';
import type { Env,Deps } from '../env';
import type { SessionRecord } from '../lib/sessions';
import { ApiError } from '../errors';
import { captureAiPolicy } from '../lib/ai-policy';
import { createFetchTransport } from '../routes/ai-engine-model';
import { actionLimits } from '../routes/ai-engine-gate';
import { summarizePr,assessPrRisk } from '../routes/ai-engine-classifier';
import { planReview } from '../routes/ai-engine-assist';
import { targetSnapshot } from './target';
import { analyzeRepositoryTask } from './model';
import { loadRun,saveRun,TERMINAL,type RunRow } from './store';
export const RUNNER_HEARTBEAT_MS=180000;
export const workflowRepo=(target:WorkflowTarget)=>`${target.owner}/${target.repo}`.toLowerCase();
export const workflowAllowedRepos=(env:Env)=>new Set((env.WORKFLOW_RUNNER_REPOS??'').split(',').map(x=>x.trim().toLowerCase()).filter(x=>/^[a-z\d-]+\/[\w.-]+$/i.test(x)));
export async function workflowCapabilities(env:Env,repo:string,now:Date):Promise<WorkflowCapabilities>{
 let ready=false;try{ready=!!env.DB&&!!await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='workflow_runs'").first();}catch{/* Fail closed on missing migration. */}
 const analysis=ready&&!!env.WORKFLOW_QUEUE;
 let runner:{last_seen_at:string}|null=null;
 if(ready&&env.DB&&env.WORKFLOW_RUNNER_TOKEN&&env.WORKFLOW_RUNNER_TOKEN.length>=32&&workflowAllowedRepos(env).has(repo.toLowerCase())){
  const rows=await env.DB.prepare('SELECT repositories_json,capabilities_json,last_seen_at FROM workflow_runners WHERE last_seen_at>? ORDER BY last_seen_at DESC LIMIT 50').bind(new Date(now.getTime()-RUNNER_HEARTBEAT_MS).toISOString()).all<{repositories_json:string;capabilities_json:string;last_seen_at:string}>();
  for(const row of rows.results??[]){try{const repos=JSON.parse(row.repositories_json) as string[],caps=JSON.parse(row.capabilities_json);if(repos.map(x=>x.toLowerCase()).includes(repo.toLowerCase())&&caps.docker&&caps.patch&&caps.qa&&caps.draftPr){runner=row;break;}}catch{/* invalid heartbeat cannot grant capability */}}
 }
 return {analysis:{available:analysis,...(!analysis?{reason:!ready?'Workflow database migration is not applied.':'The durable workflow queue is not configured.'}:{})},coding:{available:analysis&&!!runner,...(runner?{lastHeartbeatAt:runner.last_seen_at}:{reason:'No recent configured isolated runner with patch, test and draft-PR capabilities for this repository.'})},limits:{maxSteps:9,maxFiles:8,maxPatchBytes:131072},requiresAiConsent:true};
}
export const workflowSession=(userId:string):SessionRecord=>({userId,tokenHash:'workflow-background',demo:false,transport:'bearer',csrfToken:null,expiresAt:new Date(Date.now()+3600000).toISOString(),userStatus:'active'});
export async function assertRunCurrent(env:Env,deps:Deps,row:RunRow,run:WorkflowRun){
 if(!env.DB)throw new ApiError('misconfigured','Workflow storage is unavailable.');
 const user=await env.DB.prepare('SELECT status,deletion_pending FROM users WHERE id=?').bind(row.user_id).first<{status:string;deletion_pending?:number}>();
 if(!user||user.status!=='active'||user.deletion_pending)throw new ApiError('forbidden','The workflow account is no longer active.');
 const policy=await captureAiPolicy(env.DB,row.user_id,true);if(policy.revision!==row.policy_revision)throw new ApiError('consent_changed','AI choices changed. Start a new run after reviewing them.');
 const snapshot=await targetSnapshot(env,deps,workflowSession(row.user_id),run.definition.target,run.definition.mode==='code_fix');
 if(snapshot.headSha!==run.headSha)throw new ApiError('pr_changed','The target commit changed. Start a new run.');
 return snapshot;
}
export async function createWorkflowRun(env:Env,deps:Deps,session:SessionRecord,definition:WorkflowDefinition,key:string,confirmCodeChanges?:boolean):Promise<WorkflowRun>{
 if(!env.DB||!session.userId||session.demo)throw new ApiError('forbidden','Agent runs require a signed-in account and configured storage.');
 if(definition.mode==='code_fix'&&confirmCodeChanges!==true)throw new ApiError('forbidden','Explicitly authorize code changes and draft PR creation for this run.');
 const prior=await env.DB.prepare('SELECT id,body_json FROM workflow_runs WHERE user_id=? AND idempotency_key=?').bind(session.userId,key).first<{id:string;body_json:string}>();
 if(prior){const run=JSON.parse(prior.body_json) as WorkflowRun;if(JSON.stringify(run.definition)!==JSON.stringify(definition))throw new ApiError('state_conflict','This idempotency key belongs to another workflow.');return run;}
 const snapshot=await targetSnapshot(env,deps,session,definition.target,definition.mode==='code_fix');
 if(!/^[a-f0-9]{40}$/i.test(snapshot.headSha))throw new ApiError('upstream_unavailable','The target commit is unavailable.');
 const policy=await captureAiPolicy(env.DB,session.userId,true),now=deps.now().toISOString(),capabilities=await workflowCapabilities(env,workflowRepo(definition.target),deps.now());
 const available=definition.mode==='review'?capabilities.analysis.available:capabilities.coding.available;
 const run:WorkflowRun={id:crypto.randomUUID(),definition,status:available?'queued':'blocked',headSha:snapshot.headSha,revision:0,createdAt:now,updatedAt:now,capabilities,steps:definition.steps.map(s=>({id:s.id,kind:s.kind,title:s.title,status:s.enabled?(available?'pending':'blocked'):'skipped'})),...(!available?{error:definition.mode==='review'?capabilities.analysis.reason??'Analysis runtime unavailable.':capabilities.coding.reason??'Coding executor unavailable.'}:{})};
 await policy.assertCurrent();
 try{await env.DB.prepare('INSERT INTO workflow_runs(id,user_id,idempotency_key,body_json,policy_revision,revision,created_at,updated_at) VALUES(?,?,?,?,?,0,?,?)').bind(run.id,session.userId,key,JSON.stringify(run),policy.revision,now,now).run();}catch(error){const existing=await env.DB.prepare('SELECT body_json FROM workflow_runs WHERE user_id=? AND idempotency_key=?').bind(session.userId,key).first<{body_json:string}>();if(existing){const item=JSON.parse(existing.body_json) as WorkflowRun;if(JSON.stringify(item.definition)!==JSON.stringify(definition))throw new ApiError('state_conflict','This idempotency key belongs to another workflow.');return item;}throw error;}
 if(available){try{await env.WORKFLOW_QUEUE!.send({runId:run.id});}catch{const current=await loadRun(env.DB,run.id);current.run.status='failed';current.run.error='Could not enqueue the workflow. Start a new run.';await saveRun(env.DB,current.row,current.run,now);return current.run;}}
 return run;
}
export async function cancelWorkflowRun(env:Env,deps:Deps,userId:string,id:string){
 if(!env.DB)throw new ApiError('misconfigured','Workflow storage unavailable.');
 for(let attempt=0;attempt<3;attempt++){const {row,run}=await loadRun(env.DB,id,userId);if(TERMINAL.has(run.status))return run;run.status='cancelled';for(const step of run.steps)if(['pending','running'].includes(step.status))step.status='cancelled';if(await saveRun(env.DB,row,run,deps.now().toISOString())){await env.DB.prepare("UPDATE workflow_jobs SET status='cancelled',lease_hash=NULL WHERE run_id=? AND status!='done'").bind(id).run();return run;}}
 throw new ApiError('state_conflict','The workflow changed. Reload and try cancelling again.');
}
export async function processWorkflowMessage(env:Env,deps:Deps,id:string){
 if(!env.DB||!env.WORKFLOW_QUEUE)throw new ApiError('misconfigured','Workflow runtime unavailable.');
 const loaded=await loadRun(env.DB,id),{row,run}=loaded;
 if(TERMINAL.has(run.status)||run.status==='waiting_executor')return;
 if(row.lease_until&&Date.parse(row.lease_until)>deps.now().getTime())throw new Error('Workflow step already leased');
 const step=run.steps.find(s=>s.status==='pending'||s.status==='running');
 if(!step){run.status='succeeded';await saveRun(env.DB,row,run,deps.now().toISOString());return;}
 step.status='running';step.startedAt=deps.now().toISOString();run.status='running';
 if(!await saveRun(env.DB,row,run,deps.now().toISOString(),new Date(deps.now().getTime()+180000).toISOString()))return;
 const claimed=await loadRun(env.DB,id);
 try{
  const snapshot=await assertRunCurrent(env,deps,claimed.row,claimed.run),session=workflowSession(row.user_id);
  if(step.kind==='patch'){
   const caps=await workflowCapabilities(env,workflowRepo(run.definition.target),deps.now());
   if(!caps.coding.available)throw new ApiError('upstream_unavailable',caps.coding.reason??'Coding executor unavailable.');
   const now=deps.now().toISOString();
   await env.DB.prepare("INSERT OR IGNORE INTO workflow_jobs(id,run_id,user_id,repository,base_sha,status,created_at,updated_at) VALUES(?,?,?,?,?,'pending',?,?)").bind(crypto.randomUUID(),id,row.user_id,workflowRepo(run.definition.target),run.headSha,now,now).run();
   claimed.run.status='waiting_executor';await saveRun(env.DB,claimed.row,claimed.run,now);return;
  }
  if(step.kind==='qa'||step.kind==='draft_pr')throw new ApiError('state_conflict','Coding steps must be executed by the isolated runner.');
  let output:unknown;
  const source=async()=>snapshot.data;
  const aiDeps={db:env.DB,transport:createFetchTransport(deps.fetch),...(env.AI?{ai:env.AI}:{}),limits:actionLimits(env),prSource:source};
  if(step.kind==='context')output={title:snapshot.data.title,headSha:run.headSha,baseBranch:snapshot.baseBranch,kind:snapshot.kind,files:snapshot.data.files.map(f=>f.path),coverage:snapshot.kind==='pull_request'?'PR diff':'metadata only'};
  else if(step.kind==='checks')output={headSha:run.headSha,source:'GitHub recorded checks',checksFailing:snapshot.data.checksFailing,testsExecuted:false,notice:'Existing GitHub check evidence; this step did not run new tests.'};
  else if(step.kind==='route')output={destination:`https://github.com/${run.definition.target.owner}/${run.definition.target.repo}/${snapshot.kind==='issue'?'issues':snapshot.kind==='pull_request'?'pull':'tree'}/${run.definition.target.number??snapshot.baseBranch}`,action:'Review the evidence and choose the next action. No merge or comment was posted.'};
  else if(snapshot.kind!=='pull_request')output=await analyzeRepositoryTask(env,deps,session,step.kind,run.definition.intent,snapshot.data);
  else{const ref={owner:run.definition.target.owner,repo:run.definition.target.repo,number:run.definition.target.number!};output=step.kind==='risk'?(await assessPrRisk(aiDeps,session,ref,env)).body:step.kind==='review_plan'?(await planReview(aiDeps,session,ref,env)).body:(await summarizePr(aiDeps,session,ref,env)).body;}
  await assertRunCurrent(env,deps,claimed.row,claimed.run);
  const latest=await loadRun(env.DB,id);if(latest.run.status==='cancelled')return;
  const actual=latest.run.steps.find(s=>s.id===step.id)!;actual.status='succeeded';actual.finishedAt=deps.now().toISOString();actual.output=JSON.stringify(output).slice(0,24000);actual.evidence={headSha:run.headSha,source:step.kind==='checks'?'github-recorded':'workflow-execution'};
  latest.run.status=latest.run.steps.some(s=>s.status==='pending')?'queued':'succeeded';
  if(await saveRun(env.DB,latest.row,latest.run,deps.now().toISOString())&&latest.run.status==='queued')await env.WORKFLOW_QUEUE.send({runId:id});
 }catch(error){const latest=await loadRun(env.DB,id);if(TERMINAL.has(latest.run.status))return;latest.run.status='failed';latest.run.error=error instanceof ApiError?error.message:'The workflow step failed. Start a new run.';const actual=latest.run.steps.find(s=>s.id===step.id)!;actual.status='failed';actual.error=latest.run.error;actual.finishedAt=deps.now().toISOString();await saveRun(env.DB,latest.row,latest.run,deps.now().toISOString());}
}
