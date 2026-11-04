import { z } from 'zod';
import { WorkflowExecutorEvidence } from '@mergemate/contracts';
import type { Env, Deps } from '../env';
import { ApiError } from '../errors';
import { randomToken, sha256Hex, timingSafeEqual } from '../lib/crypto';
import { getAccessToken } from '../lib/github-tokens';
import { githubGet } from '../lib/github';
import { assertRunCurrent,cancelWorkflowRun,workflowAllowedRepos,workflowSession } from './runtime';
import { generateWorkflowPatch } from './model';
import { loadRun,POLICY_GUARD } from './store';
import type { RunnerClaims } from './runner-auth';
import { mintJobToken,revokeJobToken } from './github-app-token';
import { appendWorkflowAudit,auditOutboxStatement,flushWorkflowAuditOutbox } from './audit';

export const RunnerId=z.string().regex(/^[a-z\d_-]{1,100}$/i);
export const LeaseRequest=z.object({runnerId:RunnerId,leaseToken:z.string().min(16).max(128)});
export const Heartbeat=z.object({runnerId:RunnerId,repositories:z.array(z.string().regex(/^[a-z\d-]+\/[\w.-]+$/i)).min(1).max(10),capabilities:z.object({docker:z.boolean(),patch:z.boolean(),qa:z.boolean(),draftPr:z.boolean()}),version:z.literal('1')}).strict();
export const PatchRequest=LeaseRequest.extend({files:z.array(z.object({path:z.string().max(240),content:z.string().max(20000)}).strict()).min(1).max(8)}).strict();
export const ReportRequest=LeaseRequest.extend({status:z.enum(['succeeded','failed','cancelled','blocked']),stage:z.enum(['patch','qa','draft_pr']),evidence:WorkflowExecutorEvidence}).strict();
type Job={id:string;run_id:string;user_id:string;repository:string;repository_id:number|null;base_sha:string;status:string;stage:string;runner_id:string|null;lease_hash:string|null;lease_expires_at:string|null;patch_json:string|null;patch_claim_until:string|null;created_at:string};
const requireDb=(env:Env)=>{if(!env.DB)throw new ApiError('misconfigured','Workflow storage unavailable.');return env.DB;};
export async function runnerHeartbeat(env:Env,deps:Deps,value:z.infer<typeof Heartbeat>,claims?:RunnerClaims){
 const db=requireDb(env),allowed=workflowAllowedRepos(env),repos=[...new Set(value.repositories.map(x=>x.toLowerCase()))];
 if(repos.some(repo=>!allowed.has(repo)||claims&&!claims.repositories.includes(repo))||claims&&claims.sub!==value.runnerId)throw new ApiError('forbidden','Runner repository or identity is outside signed server policy.');
 const result=await db.prepare('INSERT INTO workflow_runners(id,repositories_json,capabilities_json,last_seen_at,credential_generation,credential_jti,credential_expires_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET repositories_json=excluded.repositories_json,capabilities_json=excluded.capabilities_json,last_seen_at=excluded.last_seen_at,credential_generation=excluded.credential_generation,credential_jti=excluded.credential_jti,credential_expires_at=excluded.credential_expires_at WHERE workflow_runners.revoked_at IS NULL AND (workflow_runners.credential_generation<excluded.credential_generation OR workflow_runners.credential_generation=excluded.credential_generation AND workflow_runners.credential_jti=excluded.credential_jti)').bind(value.runnerId,JSON.stringify(repos),JSON.stringify(value.capabilities),deps.now().toISOString(),claims?.gen??0,claims?.jti??null,claims?new Date(claims.exp*1000).toISOString():null).run();
 if(result.meta.changes!==1)throw new ApiError('unauthorized','Runner identity is revoked or stale.');
 return {ok:true};
}
export async function claimExecutorJob(env:Env,deps:Deps,runnerId:string,claims?:RunnerClaims){
 const db=requireDb(env),runner=await db.prepare('SELECT repositories_json,capabilities_json,last_seen_at,revoked_at FROM workflow_runners WHERE id=?').bind(runnerId).first<{repositories_json:string;capabilities_json:string;last_seen_at:string;revoked_at:string|null}>();
 if(!runner||runner.revoked_at||Date.parse(runner.last_seen_at)<deps.now().getTime()-180000)throw new ApiError('forbidden','Send a current runner heartbeat first.');
 const caps=JSON.parse(runner.capabilities_json);if(!caps.docker||!caps.patch||!caps.qa||!caps.draftPr)return {job:null};
 const repos=(JSON.parse(runner.repositories_json) as string[]).filter(repo=>workflowAllowedRepos(env).has(repo)&&(!claims||claims.sub===runnerId&&claims.repositories.includes(repo)));
 const jobs=await db.prepare("SELECT * FROM workflow_jobs WHERE status='pending' ORDER BY created_at LIMIT 50").all<Job>();
 for(const job of jobs.results??[]){
  if(!repos.includes(job.repository))continue;
  const {row,run}=await loadRun(db,job.run_id);
  if(run.status!=='waiting_executor'||job.user_id!==row.user_id){await db.prepare("UPDATE workflow_jobs SET status='cancelled' WHERE id=? AND status='pending'").bind(job.id).run();continue;}
  let snapshot;try{snapshot=await assertRunCurrent(env,deps,row,run);if(job.repository_id!==snapshot.repositoryId||job.repository!==snapshot.repository||snapshot.fromFork)throw new ApiError('forbidden','Repository identity changed or is not executor eligible.');}catch{await db.prepare("UPDATE workflow_jobs SET status='blocked' WHERE id=? AND status='pending'").bind(job.id).run();continue;}
  const token=randomToken(),leaseHash=await sha256Hex(token),expires=new Date(deps.now().getTime()+30000).toISOString(),now=deps.now().toISOString();
  const reserved=await db.batch([
   db.prepare("UPDATE workflow_jobs SET status='minting',runner_id=?,lease_hash=?,lease_expires_at=?,updated_at=? WHERE id=? AND status='pending'").bind(runnerId,leaseHash,expires,now,job.id),
   auditOutboxStatement(db,job.user_id,`job:${job.id}:reserved:${leaseHash}`,'job_reserved',job.id,{runnerId,repositoryId:job.repository_id,leaseExpiresAt:expires},now,"EXISTS(SELECT 1 FROM workflow_jobs WHERE id=? AND status='minting' AND runner_id=? AND lease_hash=?)",[job.id,runnerId,leaseHash]),
  ]);
  if(reserved.some(item=>item.meta.changes!==1))continue;
  let github:Awaited<ReturnType<typeof mintJobToken>>|undefined;
  try{
   await flushWorkflowAuditOutbox(db,job.user_id,env.WORKFLOW_RUNNER_SIGNING_KEY??'');
   github=await mintJobToken(env,deps,job.repository,job.repository_id);
   await appendWorkflowAudit(db,job.user_id,`job:${job.id}:token:${leaseHash}`,'github_token_minted',job.id,{repositoryId:job.repository_id,installationId:github.installationId,expiresAt:github.expiresAt},now,env.WORKFLOW_RUNNER_SIGNING_KEY??'');
   const activated=await db.prepare("UPDATE workflow_jobs SET status='running',updated_at=? WHERE id=? AND status='minting' AND runner_id=? AND lease_hash=?").bind(now,job.id,runnerId,leaseHash).run();if(activated.meta.changes!==1)throw new ApiError('state_conflict','Executor claim reservation changed.');
   await appendWorkflowAudit(db,job.user_id,`job:${job.id}:claimed:${leaseHash}`,'job_claimed',job.id,{runnerId,repositoryId:job.repository_id,leaseExpiresAt:expires},now,env.WORKFLOW_RUNNER_SIGNING_KEY??'');
  }catch(error){if(github)await revokeJobToken(deps,github.token);await db.prepare("UPDATE workflow_jobs SET status='pending',runner_id=NULL,lease_hash=NULL,lease_expires_at=NULL,updated_at=? WHERE id=? AND runner_id=? AND lease_hash=? AND status IN ('minting','running')").bind(deps.now().toISOString(),job.id,runnerId,leaseHash).run();await appendWorkflowAudit(db,job.user_id,`job:${job.id}:claim_failed:${leaseHash}`,'job_claim_failed',job.id,{runnerId,repositoryId:job.repository_id},deps.now().toISOString(),env.WORKFLOW_RUNNER_SIGNING_KEY??'').catch(()=>undefined);throw error;}
  if(!github)throw new ApiError('state_conflict','Executor claim did not receive a GitHub token.');
  const target=run.definition.target;
  return {job:{id:job.id,runId:job.run_id,repository:job.repository,repositoryId:job.repository_id,baseSha:job.base_sha,baseBranch:snapshot.baseBranch,targetKind:target.kind??'pull_request',targetNumber:target.number,...((target.kind??'pull_request')==='pull_request'?{targetPr:target.number}:{}),intent:run.definition.intent,leaseToken:token,leaseExpiresAt:expires,githubAccessToken:github.token,githubTokenExpiresAt:github.expiresAt,limits:{maxFiles:8,maxPatchBytes:131072}}};
 }
 return {job:null};
}
export async function activeExecutorJob(env:Env,deps:Deps,id:string,request:z.infer<typeof LeaseRequest>,claims?:RunnerClaims){
 const db=requireDb(env),job=await db.prepare('SELECT * FROM workflow_jobs WHERE id=?').bind(id).first<Job>();
 if(!job||job.status!=='running'||job.runner_id!==request.runnerId||claims&&(claims.sub!==request.runnerId||!claims.repositories.includes(job.repository))||!job.lease_hash||!timingSafeEqual(job.lease_hash,await sha256Hex(request.leaseToken))||Date.parse(job.lease_expires_at??'')<=deps.now().getTime()||Date.parse(job.created_at)<deps.now().getTime()-3600000||!workflowAllowedRepos(env).has(job.repository))throw new ApiError('state_conflict','The executor lease is no longer active.');
 const state=await loadRun(db,job.run_id);
 if(state.run.status!=='waiting_executor')throw new ApiError('state_conflict','The workflow is no longer waiting for this runner.');
 try{const snapshot=await assertRunCurrent(env,deps,state.row,state.run);if(job.repository_id!==snapshot.repositoryId||job.repository!==snapshot.repository||snapshot.fromFork)throw new ApiError('forbidden','Repository identity changed or is not executor eligible.');}catch(error){
  if(error instanceof ApiError&&['consent_required','consent_changed','pr_changed','forbidden'].includes(error.code))await cancelWorkflowRun(env,deps,job.user_id,job.run_id).catch(()=>undefined);
  throw error;
 }
 return {job,...state};
}
export async function renewExecutorLease(env:Env,deps:Deps,id:string,request:z.infer<typeof LeaseRequest>,claims?:RunnerClaims){
 const db=requireDb(env),{job}=await activeExecutorJob(env,deps,id,request,claims),expires=new Date(deps.now().getTime()+30000).toISOString();
 const result=await db.prepare("UPDATE workflow_jobs SET lease_expires_at=?,updated_at=? WHERE id=? AND status='running' AND lease_hash=?").bind(expires,deps.now().toISOString(),id,job.lease_hash).run();
 if(result.meta.changes!==1)throw new ApiError('state_conflict','Executor lease was revoked.');
 return {active:true,cancelled:false,leaseExpiresAt:expires};
}
const permittedSource=(path:string)=>/^(?:apps\/(?:mobile|web)\/(?:src|app|test)|packages\/contracts\/(?:src|test))\/[a-zA-Z\d_./()[\]-]+\.(?:[cm]?[jt]sx?|css|md)$/.test(path)&&!path.split('/').some(x=>!x||x==='.'||x==='..')&&!/(?:^|\/)(?:\.git(?:hub)?|\.mergemate|auth|oauth|session|billing|migrations?|secrets?|credentials?|deploy(?:ment)?s?)(?:\/|[._-]|$)|AuthContext|(?:auth|oauth|session|token|secret|credential|wrangler|package(?:-lock)?|app\.config|tsconfig|eas|dockerfile|compose\.ya?ml)\./i.test(path);
export async function executorPatch(env:Env,deps:Deps,id:string,value:z.infer<typeof PatchRequest>,claims?:RunnerClaims){
 const db=requireDb(env),state=await activeExecutorJob(env,deps,id,value,claims),{job,run}=state;
 if(job.stage!=='patch')throw new ApiError('state_conflict','The patch step has already finished.');
 if(job.patch_json)return JSON.parse(job.patch_json);
 if(value.files.some(f=>!permittedSource(f.path))||new Set(value.files.map(f=>f.path)).size!==value.files.length||new TextEncoder().encode(JSON.stringify(value.files)).length>98304)throw new ApiError('validation_failed','Source context violates the approved file scope.');
 const now=deps.now(),until=new Date(now.getTime()+60000).toISOString();
 const lock=await db.prepare("UPDATE workflow_jobs SET patch_claim_until=? WHERE id=? AND status='running' AND lease_hash=? AND (patch_claim_until IS NULL OR patch_claim_until<?)").bind(until,id,job.lease_hash,now.toISOString()).run();
 if(lock.meta.changes!==1)throw new ApiError('state_conflict','A patch request is already in progress.');
 try{
  const token=await getAccessToken(env,job.user_id,deps.now());
  for(const file of value.files){
   const item=await githubGet<{type:string;encoding:string;content:string}>(deps,token,`/repos/${job.repository}/contents/${file.path.split('/').map(encodeURIComponent).join('/')}?ref=${job.base_sha}`);
   let actual='';try{actual=new TextDecoder('utf-8',{fatal:true,ignoreBOM:false}).decode(Uint8Array.from(atob(item.content.replace(/\s/g,'')),c=>c.charCodeAt(0)));}catch{throw new ApiError('validation_failed','Source encoding is unsupported.');}
   if(item.type!=='file'||item.encoding!=='base64'||actual!==file.content)throw new ApiError('pr_changed','Source context does not match the pinned repository snapshot.');
  }
  const patch=await generateWorkflowPatch(env,deps,workflowSession(job.user_id),run.definition.intent,value.files);
  if(patch.changes.some(f=>!permittedSource(f.path)))throw new ApiError('upstream_unavailable','The patch violates protected-path policy.');
  await activeExecutorJob(env,deps,id,value,claims);
  const saved=await db.prepare("UPDATE workflow_jobs SET patch_json=?,patch_claim_until=NULL WHERE id=? AND status='running' AND lease_hash=? AND patch_claim_until=?").bind(JSON.stringify(patch),id,job.lease_hash,until).run();
  if(saved.meta.changes!==1)throw new ApiError('state_conflict','The patch lease changed.');
  return patch;
 }catch(error){await db.prepare('UPDATE workflow_jobs SET patch_claim_until=NULL WHERE id=? AND patch_claim_until=?').bind(id,until).run();throw error;}
}
export async function executorReport(env:Env,deps:Deps,id:string,value:z.infer<typeof ReportRequest>,claims?:RunnerClaims){
 const db=requireDb(env),reportHash=await sha256Hex(JSON.stringify({status:value.status,stage:value.stage,evidence:value.evidence}));
 const replayJob=await db.prepare('SELECT * FROM workflow_jobs WHERE id=?').bind(id).first<Job>();
 if(replayJob&&replayJob.runner_id===value.runnerId&&(!claims||claims.sub===value.runnerId&&claims.repositories.includes(replayJob.repository))&&replayJob.lease_hash&&timingSafeEqual(replayJob.lease_hash,await sha256Hex(value.leaseToken))&&workflowAllowedRepos(env).has(replayJob.repository)){
  const replay=await loadRun(db,replayJob.run_id);
  if(replay.run.steps.find(s=>s.kind===value.stage)?.evidence?.reportHash===reportHash)return {accepted:true,status:replay.run.status};
 }
 const {job,run,row}=await activeExecutorJob(env,deps,id,value,claims);
 if(job.stage!==value.stage)throw new ApiError('state_conflict','Report stage is not current.');
 if(value.evidence.baseSha!==job.base_sha)throw new ApiError('pr_changed','Evidence does not match the pinned source.');
 const expectedPatch=job.patch_json?JSON.parse(job.patch_json) as {changes:{path:string;content:string}[]}:null;
 if(value.status==='succeeded'){
  const expectedHash=expectedPatch?await sha256Hex(JSON.stringify(expectedPatch.changes.map(({path,content})=>({path,content})))):null;
  if(!expectedHash||value.evidence.patchHash!==expectedHash)throw new ApiError('validation_failed','Patch evidence does not match the generated patch.');
  if(value.stage==='qa'&&(!value.evidence.tests?.length||value.evidence.tests.some(t=>t.exitCode!==0)))throw new ApiError('validation_failed','Successful isolated tests are required.');
  if(value.stage==='draft_pr'){
   const expected=`https://github.com/${job.repository}/pull/`,url=value.evidence.draftPrUrl;
   if(!value.evidence.commitSha||!url||!url.startsWith(expected)||!/^\d+$/.test(url.slice(expected.length)))throw new ApiError('validation_failed','Draft PR evidence is incomplete.');
   const qa=run.steps.find(s=>s.kind==='qa');if(qa?.status!=='succeeded')throw new ApiError('state_conflict','Isolated tests have not passed.');
   const token=await getAccessToken(env,job.user_id,deps.now());
   const pr=await githubGet<{draft:boolean;head:{sha:string;repo:{full_name:string}};base:{repo:{full_name:string}}}>(deps,token,`/repos/${job.repository}/pulls/${url.slice(expected.length)}`);
   if(pr.draft!==true||pr.head.sha!==value.evidence.commitSha||pr.head.repo.full_name.toLowerCase()!==job.repository||pr.base.repo.full_name.toLowerCase()!==job.repository)throw new ApiError('validation_failed','GitHub did not confirm the reported draft PR.');
  }
 }
 const next=value.stage==='patch'?'qa':value.stage==='qa'?'draft_pr':'done';
 const step=run.steps.find(s=>s.kind===value.stage);if(!step)throw new ApiError('state_conflict','The run does not contain this step.');
 step.status=value.status;step.finishedAt=deps.now().toISOString();step.evidence={...value.evidence,source:'configured-executor',reportHash};step.output=value.evidence.summary;
 if(value.status!=='succeeded'){run.status=value.status;run.error=value.evidence.summary??'Executor did not complete the step.';for(const pending of run.steps)if(pending.status==='pending')pending.status='blocked';}
 else if(next==='done'){run.status=run.steps.some(s=>s.status==='pending')?'queued':'succeeded';}
 else{const following=run.steps.find(s=>s.kind===next);if(following){following.status='running';following.startedAt=deps.now().toISOString();}}
 const now=deps.now().toISOString();run.revision=row.revision+1;run.updatedAt=now;
 const jobStatus=value.status==='succeeded'&&next!=='done'?'running':value.status==='succeeded'?'done':value.status;
 const result=await db.batch([
  db.prepare(`UPDATE workflow_jobs SET stage=?,status=?,updated_at=?,patch_json=CASE WHEN ?='running' THEN patch_json ELSE NULL END,patch_claim_until=NULL WHERE id=? AND status='running' AND stage=? AND lease_hash=? AND EXISTS(SELECT 1 FROM workflow_runs WHERE id=? AND revision=? AND ${POLICY_GUARD})`).bind(value.status==='succeeded'?next:value.stage,jobStatus,now,jobStatus,id,value.stage,job.lease_hash,row.id,row.revision),
  db.prepare(`UPDATE workflow_runs SET body_json=?,revision=revision+1,updated_at=?,lease_until=NULL WHERE id=? AND revision=? AND ${POLICY_GUARD} AND EXISTS(SELECT 1 FROM workflow_jobs WHERE id=? AND stage=? AND status=?)`).bind(JSON.stringify(run),now,row.id,row.revision,id,value.status==='succeeded'?next:value.stage,jobStatus),
  auditOutboxStatement(db,job.user_id,`job:${id}:report:${value.stage}:${reportHash}`,'job_reported',id,{stage:value.stage,status:value.status,reportHash},now,'EXISTS(SELECT 1 FROM workflow_jobs WHERE id=? AND stage=? AND status=?)',[id,value.status==='succeeded'?next:value.stage,jobStatus]),
 ]);
 if(result.some(item=>item.meta.changes!==1))throw new ApiError('state_conflict','Executor report was superseded.');
 await flushWorkflowAuditOutbox(db,job.user_id,env.WORKFLOW_RUNNER_SIGNING_KEY??'');
 if(run.status==='queued'){if(!env.WORKFLOW_QUEUE)throw new ApiError('misconfigured','Workflow queue unavailable.');await env.WORKFLOW_QUEUE.send({runId:run.id});}
 return {accepted:true,status:run.status};
}
