import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { WorkflowPlanRequest,WorkflowRunRequest } from '@mergemate/contracts';
import type { AppEnv } from '../env';
import { ApiError } from '../errors';
import { requireBinding } from '../config';
import { getAccessToken } from '../lib/github-tokens';
import { githubGet } from '../lib/github';
import { workflowCapabilities,createWorkflowRun,cancelWorkflowRun } from '../workflows/runtime';
import { listRuns,loadRun } from '../workflows/store';
import { targetSnapshot } from '../workflows/target';
import { generateWorkflowPlan } from '../workflows/model';
import { authorizeExecutor,RunnerId,LeaseRequest,Heartbeat,PatchRequest,ReportRequest,runnerHeartbeat,claimExecutorJob,renewExecutorLease,executorPatch,executorReport } from '../workflows/executor';

function parse<T>(schema:z.ZodType<T>,value:unknown):T{const result=schema.safeParse(value);if(!result.success)throw new ApiError('validation_failed','The workflow request is invalid.');return result.data;}
const ensureStorage=async(c:Context<AppEnv>)=>{const db=requireBinding(c.env,'DB');const row=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='workflow_runs'").first();if(!row)throw new ApiError('misconfigured','Apply the workflow database migration before starting runs.');return db;};
const requireActor=(session:{userId:string|null;demo:boolean})=>{if(session.demo||!session.userId)throw new ApiError('forbidden','Live agent workflows require a signed-in GitHub account.');return session.userId;};
export function createWorkflowRouter(){
 const router=new Hono<AppEnv>();
 router.use('*',async(c,next)=>{requireActor(c.get('session'));c.header('Cache-Control','no-store');return next();});
 router.get('/capabilities',async c=>{
  const repo=c.req.query('repo')??'';if(!/^[a-z\d-]+\/[\w.-]+$/i.test(repo))throw new ApiError('validation_failed','Choose a repository.');
  const session=c.get('session'),deps=c.get('deps'),token=await getAccessToken(c.env,session.userId!,deps.now());
  const info=await githubGet<{permissions?:{push?:boolean;maintain?:boolean;admin?:boolean}}>(deps,token,`/repos/${repo}`),caps=await workflowCapabilities(c.env,repo,deps.now());
  if(!(info.permissions?.push||info.permissions?.maintain||info.permissions?.admin))caps.coding={available:false,reason:'Your GitHub connection must prove write access before a coding workflow can run.'};
  return c.json(caps);
 });
 router.post('/plan',async c=>{const input=parse(WorkflowPlanRequest,await c.req.json().catch(()=>null));await targetSnapshot(c.env,c.get('deps'),c.get('session'),input.target,input.mode==='code_fix');return c.json(await generateWorkflowPlan(c.env,c.get('deps'),c.get('session'),input));});
 router.post('/runs',async c=>{await ensureStorage(c);const body=parse(WorkflowRunRequest,await c.req.json().catch(()=>null));return c.json(await createWorkflowRun(c.env,c.get('deps'),c.get('session'),body.definition,body.idempotencyKey,body.confirmCodeChanges));});
 router.get('/runs',async c=>{const db=await ensureStorage(c);return c.json({runs:await listRuns(db,c.get('session').userId!)});});
 router.get('/runs/:id',async c=>{const db=await ensureStorage(c);return c.json((await loadRun(db,c.req.param('id'),c.get('session').userId!)).run);});
 router.post('/runs/:id/cancel',async c=>{await ensureStorage(c);return c.json(await cancelWorkflowRun(c.env,c.get('deps'),c.get('session').userId!,c.req.param('id')));});
 return router;
}
export function createWorkflowExecutorRouter(){
 const router=new Hono<AppEnv>();
 router.use('*',async(c,next)=>{authorizeExecutor(c.env,c.req.header('authorization'),c.req.header('origin'));await ensureStorage(c);c.header('Cache-Control','no-store');return next();});
 router.post('/heartbeat',async c=>c.json(await runnerHeartbeat(c.env,c.get('deps'),parse(Heartbeat,await c.req.json().catch(()=>null)))));
 router.post('/claim',async c=>{const body=parse(z.object({runnerId:RunnerId}).strict(),await c.req.json().catch(()=>null));return c.json(await claimExecutorJob(c.env,c.get('deps'),body.runnerId));});
 router.post('/jobs/:id/lease',async c=>c.json(await renewExecutorLease(c.env,c.get('deps'),c.req.param('id'),parse(LeaseRequest.strict(),await c.req.json().catch(()=>null)))));
 router.post('/jobs/:id/patch',async c=>c.json(await executorPatch(c.env,c.get('deps'),c.req.param('id'),parse(PatchRequest,await c.req.json().catch(()=>null)))));
 router.post('/jobs/:id/report',async c=>c.json(await executorReport(c.env,c.get('deps'),c.req.param('id'),parse(ReportRequest,await c.req.json().catch(()=>null)))));
 return router;
}
