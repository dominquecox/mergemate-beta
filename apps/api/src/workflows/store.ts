import { WorkflowRun } from '@mergemate/contracts';
import type { WorkflowRun as Run } from '@mergemate/contracts';
import { ApiError } from '../errors';
export interface RunRow {id:string;user_id:string;body_json:string;policy_revision:string;revision:number;lease_until:string|null}
export const TERMINAL=new Set(['succeeded','failed','cancelled','blocked']);
export async function loadRun(db:D1Database,id:string,userId?:string):Promise<{row:RunRow;run:Run}>{
 const row=await db.prepare(`SELECT * FROM workflow_runs WHERE id=?${userId?' AND user_id=?':''}`).bind(id,...(userId?[userId]:[])).first<RunRow>();
 if(!row)throw new ApiError('not_found','Workflow run not found.');
 const parsed=WorkflowRun.safeParse(JSON.parse(row.body_json));
 if(!parsed.success)throw new ApiError('internal','Workflow state could not be read.');
 return {row,run:parsed.data};
}
export async function saveRun(db:D1Database,row:RunRow,run:Run,now:string,leaseUntil:string|null=null):Promise<boolean>{
 run.revision=row.revision+1;run.updatedAt=now;
 const result=await db.prepare('UPDATE workflow_runs SET body_json=?,revision=revision+1,updated_at=?,lease_until=? WHERE id=? AND revision=?').bind(JSON.stringify(run),now,leaseUntil,row.id,row.revision).run();
 return (result.meta.changes??0)>0;
}
export async function listRuns(db:D1Database,userId:string):Promise<Run[]>{
 const rows=await db.prepare('SELECT body_json FROM workflow_runs WHERE user_id=? ORDER BY created_at DESC LIMIT 20').bind(userId).all<{body_json:string}>();
 return (rows.results??[]).map(r=>WorkflowRun.parse(JSON.parse(r.body_json)));
}
