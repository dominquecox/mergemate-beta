import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { WorkflowDefinition,WorkflowPlanRequest,WorkflowRunRequest } from '@mergemate/contracts';
import type { AppEnv } from '../env';
import { ApiError } from '../errors';
import { requireBinding } from '../config';
import { getAccessToken } from '../lib/github-tokens';
import { githubGet } from '../lib/github';
import { workflowCapabilities,createWorkflowRun,cancelWorkflowRun } from '../workflows/runtime';
import { listRuns,loadRun } from '../workflows/store';
import { targetSnapshot } from '../workflows/target';
import { generateWorkflowPlan } from '../workflows/model';
import { RunnerId,LeaseRequest,Heartbeat,PatchRequest,ReportRequest,runnerHeartbeat,claimExecutorJob,renewExecutorLease,executorArchive,executorPatch,executorReport } from '../workflows/executor';
import { authorizeExecutor } from '../workflows/runner-auth';
import { PasskeyRequest,registrationOptions,verifyRegistration,patchProposal,approvalOptions,approvePatch } from '../workflows/passkeys';
import { verifyWorkflowAudit } from '../workflows/audit';
import { isBoardRun,publishApprovedBoardRun } from '../brain/worker-agent';
import { assertAgentRunAllowed } from '../brain/kill-switch';

function parse<T>(schema:z.ZodType<T>,value:unknown):T{const result=schema.safeParse(value);if(!result.success)throw new ApiError('validation_failed','The workflow request is invalid.');return result.data;}
const ensureStorage=async(c:Context<AppEnv>)=>{const db=requireBinding(c.env,'DB');const row=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='workflow_runs'").first();if(!row)throw new ApiError('misconfigured','Apply the workflow database migration before starting runs.');return db;};
const requireActor=(session:{userId:string|null;demo:boolean})=>{if(session.demo||!session.userId)throw new ApiError('forbidden','Live agent workflows require a signed-in GitHub account.');return session.userId;};
export function createWorkflowRouter(){
 const router=new Hono<AppEnv>();
 router.use('*',async(c,next)=>{requireActor(c.get('session'));c.header('Cache-Control','no-store');return next();});
 router.get('/definitions',async c=>{const db=await ensureStorage(c),user=requireActor(c.get('session'));const rows=await db.prepare('SELECT body_json FROM workflow_definitions WHERE user_id=? ORDER BY updated_at DESC LIMIT 20').bind(user).all<{body_json:string}>();return c.json({definitions:(rows.results??[]).map(row=>WorkflowDefinition.parse(JSON.parse(row.body_json)))});});
 router.post('/definitions',async c=>{
  const db=await ensureStorage(c),user=requireActor(c.get('session')),definition=parse(WorkflowDefinition,await c.req.json().catch(()=>null)),now=c.get('deps').now().toISOString();
  if(definition.id){const result=await db.prepare('UPDATE workflow_definitions SET body_json=?,updated_at=? WHERE id=? AND user_id=?').bind(JSON.stringify(definition),now,definition.id,user).run();if(result.meta.changes!==1)throw new ApiError('not_found','Saved workflow not found.');}
  else{definition.id=crypto.randomUUID();const result=await db.prepare('INSERT INTO workflow_definitions(id,user_id,body_json,created_at,updated_at) SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM workflow_definitions WHERE user_id=?)<20').bind(definition.id,user,JSON.stringify(definition),now,now,user).run();if(result.meta.changes!==1)throw new ApiError('rate_limited','Save at most 20 workflows. Delete one before saving another.');}
  return c.json(definition);
 });
 router.delete('/definitions/:id',async c=>{const db=await ensureStorage(c);const result=await db.prepare('DELETE FROM workflow_definitions WHERE id=? AND user_id=?').bind(c.req.param('id'),requireActor(c.get('session'))).run();if(result.meta.changes!==1)throw new ApiError('not_found','Saved workflow not found.');return c.json({deleted:true});});
 router.get('/capabilities',async c=>{
  const repo=c.req.query('repo')??'';if(!/^[a-z\d-]+\/[\w.-]+$/i.test(repo))throw new ApiError('validation_failed','Choose a repository.');
  const session=c.get('session'),userId=requireActor(session),deps=c.get('deps'),token=await getAccessToken(c.env,userId,deps.now());
  const info=await githubGet<{permissions?:{push?:boolean;maintain?:boolean;admin?:boolean}}>(deps,token,`/repos/${repo}`),caps=await workflowCapabilities(c.env,repo,deps.now(),userId);
  if(!(info.permissions?.push||info.permissions?.maintain||info.permissions?.admin))caps.coding={available:false,reason:'Your GitHub connection must prove write access before a coding workflow can run.'};
  return c.json(caps);
 });
 router.post('/plan',async c=>{const input=parse(WorkflowPlanRequest,await c.req.json().catch(()=>null));if(input.mode==='review'&&(input.target.kind??'pull_request')!=='pull_request')throw new ApiError('validation_failed','Review workflows require a pull request target.');await targetSnapshot(c.env,c.get('deps'),c.get('session'),input.target,input.mode==='code_fix');return c.json(await generateWorkflowPlan(c.env,c.get('deps'),c.get('session'),input));});
 router.post('/runs',async c=>{await ensureStorage(c);const body=parse(WorkflowRunRequest,await c.req.json().catch(()=>null));return c.json(await createWorkflowRun(c.env,c.get('deps'),c.get('session'),body.definition,body.idempotencyKey,body.confirmCodeChanges));});
 router.get('/runs',async c=>{const db=await ensureStorage(c);return c.json({runs:await listRuns(db,requireActor(c.get('session')))});});
 router.post('/passkeys/registration/options',async c=>{await ensureStorage(c);return c.json(await registrationOptions(c.env,c.get('deps'),c.get('session')));});
 router.post('/passkeys/registration/verify',async c=>{await ensureStorage(c);return c.json(await verifyRegistration(c.env,c.get('deps'),c.get('session'),parse(PasskeyRequest,await c.req.json().catch(()=>null))));});
 router.get('/audit/verify',async c=>{const db=await ensureStorage(c);return c.json(await verifyWorkflowAudit(db,requireActor(c.get('session')),c.env.WORKFLOW_RUNNER_SIGNING_KEY??''));});
 router.get('/runs/:id/patch-proposal',async c=>{await ensureStorage(c);return c.json(await patchProposal(c.env,requireActor(c.get('session')),c.req.param('id')));});
 router.post('/runs/:id/approval/options',async c=>{await ensureStorage(c);return c.json(await approvalOptions(c.env,c.get('deps'),c.get('session'),c.req.param('id')));});
 router.post('/runs/:id/approval/verify',async c=>{await ensureStorage(c);const runId=c.req.param('id'),actor=requireActor(c.get('session'));
  // Board runs stop before the approval is recorded when agent runs are switched off or the account is blocked.
  if(await isBoardRun(c.env,actor,runId))await assertAgentRunAllowed(c.env,actor);
  const approved=await approvePatch(c.env,c.get('deps'),c.get('session'),runId,parse(PasskeyRequest,await c.req.json().catch(()=>null)));
  // Board runs publish in the Worker right after their passkey approval; every other run waits for its runner as before.
  const userId=requireActor(c.get('session'));if(!await isBoardRun(c.env,userId,runId))return c.json(approved);
  const published=await publishApprovedBoardRun(c.env,c.get('deps'),userId,runId,c.get('requestId'));return c.json({...approved,run:published.run,draftPrUrl:published.draftPrUrl});});
 router.get('/runs/:id',async c=>{const db=await ensureStorage(c);return c.json((await loadRun(db,c.req.param('id'),requireActor(c.get('session')))).run);});
 router.post('/runs/:id/cancel',async c=>{await ensureStorage(c);return c.json(await cancelWorkflowRun(c.env,c.get('deps'),requireActor(c.get('session')),c.req.param('id')));});
 return router;
}
export function createWorkflowExecutorRouter(){
 const router=new Hono<AppEnv>();
 router.use('*',async(c,next)=>{await ensureStorage(c);c.header('Cache-Control','no-store');return next();});
 // Authenticate before validating, so an unauthenticated caller learns nothing about the request shape.
 const authenticated=async<T extends {runnerId:string}>(c:Context<AppEnv>,schema:z.ZodType<T>,allowEnrollment=false)=>{const raw:unknown=await c.req.json().catch(()=>null),runnerId=raw&&typeof raw==='object'&&typeof (raw as {runnerId?:unknown}).runnerId==='string'?(raw as {runnerId:string}).runnerId:'';const claims=await authorizeExecutor(c.env,c.get('deps'),c.req.header('authorization'),c.req.header('origin'),c.req.header('cf-access-jwt-assertion'),runnerId,allowEnrollment),body=parse(schema,raw);return {body,claims};};
 router.post('/heartbeat',async c=>{const {body,claims}=await authenticated(c,Heartbeat,true);return c.json(await runnerHeartbeat(c.env,c.get('deps'),body,claims));});
 router.post('/claim',async c=>{const {body,claims}=await authenticated(c,z.object({runnerId:RunnerId}).strict());return c.json(await claimExecutorJob(c.env,c.get('deps'),body.runnerId,claims));});
 router.post('/jobs/:id/lease',async c=>{const {body,claims}=await authenticated(c,LeaseRequest.strict());return c.json(await renewExecutorLease(c.env,c.get('deps'),c.req.param('id'),body,claims));});
 router.post('/jobs/:id/archive',async c=>{const {body,claims}=await authenticated(c,LeaseRequest.strict());const archive=await executorArchive(c.env,c.get('deps'),c.req.param('id'),body,claims);return new Response(archive,{headers:{'content-type':'application/gzip','content-length':String(archive.byteLength),'cache-control':'no-store'}});});
 router.post('/jobs/:id/patch',async c=>{const {body,claims}=await authenticated(c,PatchRequest);return c.json(await executorPatch(c.env,c.get('deps'),c.req.param('id'),body,claims));});
 router.post('/jobs/:id/report',async c=>{const {body,claims}=await authenticated(c,ReportRequest);return c.json(await executorReport(c.env,c.get('deps'),c.req.param('id'),body,claims));});
 return router;
}
