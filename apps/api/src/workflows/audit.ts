import { ApiError } from '../errors';
import { sha256Hex,timingSafeEqual } from '../lib/crypto';

type AuditRow={event_key:string;sequence:number;previous_hash:string|null;event_hash:string;event_type:string;subject_id:string;body_json:string;created_at:string};
type OutboxRow={event_key:string;event_type:string;subject_id:string;body_json:string;created_at:string};
type Checkpoint={event_count:number;head_hash:string;signature:string;updated_at:string};
const encoder=new TextEncoder();
const validIdentity=(eventKey:string,eventType:string,subjectId:string)=>{if(!/^[a-z\d:._-]{1,240}$/i.test(eventKey)||!/^[a-z\d._-]{1,80}$/i.test(eventType)||!/^[a-z\d_-]{1,100}$/i.test(subjectId))throw new ApiError('validation_failed','Workflow audit identity is invalid.');};
const key=async(secret:string)=>{if(secret.length<32)throw new ApiError('misconfigured','Workflow audit signing is unavailable.');return crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);};
const signature=async(secret:string,userId:string,count:number,head:string)=>btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC',await key(secret),encoder.encode(`mergemate-workflow-audit-v1\n${userId}\n${count}\n${head}`))))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
const parseBody=(value:string)=>{try{const body=JSON.parse(value) as unknown;if(!body||typeof body!=='object'||Array.isArray(body))throw new Error();return body as Record<string,unknown>;}catch{throw new ApiError('state_conflict','Workflow audit chain is invalid.');}};

async function trustedCheckpoint(db:D1Database,userId:string,secret:string){const checkpoint=await db.prepare('SELECT event_count,head_hash,signature,updated_at FROM workflow_audit_checkpoints WHERE user_id=?').bind(userId).first<Checkpoint>();if(!checkpoint)return null;const expected=await signature(secret,userId,checkpoint.event_count,checkpoint.head_hash);if(!timingSafeEqual(checkpoint.signature,expected))throw new ApiError('state_conflict','Workflow audit checkpoint authentication failed.');return checkpoint;}

export function auditOutboxStatement(db:D1Database,userId:string,eventKey:string,eventType:string,subjectId:string,body:Record<string,unknown>,createdAt:string,conditionSql='1',conditionBindings:unknown[]=[]){validIdentity(eventKey,eventType,subjectId);const bodyJson=JSON.stringify(body);if(new TextEncoder().encode(bodyJson).length>8192)throw new ApiError('validation_failed','Workflow audit event is too large.');return db.prepare(`INSERT INTO workflow_audit_outbox(event_key,user_id,event_type,subject_id,body_json,created_at) SELECT ?,?,?,?,?,? WHERE ${conditionSql}`).bind(eventKey,userId,eventType,subjectId,bodyJson,createdAt,...conditionBindings);}

export async function flushWorkflowAuditOutbox(db:D1Database,userId:string,secret:string){
 for(let attempt=0;attempt<100;attempt++){
  const checkpoint=await trustedCheckpoint(db,userId,secret),pending=await db.prepare('SELECT event_key,event_type,subject_id,body_json,created_at FROM workflow_audit_outbox WHERE user_id=? ORDER BY created_at,event_key LIMIT 1').bind(userId).first<OutboxRow>();if(!pending)return checkpoint?{valid:true,count:checkpoint.event_count,head:checkpoint.head_hash}:{valid:true,count:0,head:null};
  const sequence=(checkpoint?.event_count??0)+1,previousHash=checkpoint?.head_hash??null,body=parseBody(pending.body_json),eventHash=await sha256Hex(JSON.stringify({userId,eventKey:pending.event_key,sequence,previousHash,eventType:pending.event_type,subjectId:pending.subject_id,body,createdAt:pending.created_at})),signed=await signature(secret,userId,sequence,eventHash);
  try{const result=await db.batch([
   db.prepare('INSERT INTO workflow_audit_events(id,user_id,event_key,sequence,previous_hash,event_hash,event_type,subject_id,body_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),userId,pending.event_key,sequence,previousHash,eventHash,pending.event_type,pending.subject_id,pending.body_json,pending.created_at),
   db.prepare('INSERT INTO workflow_audit_checkpoints(user_id,event_count,head_hash,signature,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET event_count=excluded.event_count,head_hash=excluded.head_hash,signature=excluded.signature,updated_at=excluded.updated_at WHERE workflow_audit_checkpoints.event_count=? AND workflow_audit_checkpoints.head_hash=? AND workflow_audit_checkpoints.signature=?').bind(userId,sequence,eventHash,signed,pending.created_at,checkpoint?.event_count??0,checkpoint?.head_hash??'',checkpoint?.signature??''),
   db.prepare('DELETE FROM workflow_audit_outbox WHERE user_id=? AND event_key=?').bind(userId,pending.event_key),
  ]);if(result.every(item=>item.meta.changes===1))continue;}catch(error){if(attempt===99)throw error;}
 }
 throw new ApiError('state_conflict','Workflow audit chain changed. Retry the operation.');
}

export async function appendWorkflowAudit(db:D1Database,userId:string,eventKey:string,eventType:string,subjectId:string,body:Record<string,unknown>,createdAt:string,secret:string){
 validIdentity(eventKey,eventType,subjectId);const existing=await db.prepare('SELECT event_type,subject_id,body_json,event_hash FROM workflow_audit_events WHERE user_id=? AND event_key=?').bind(userId,eventKey).first<{event_type:string;subject_id:string;body_json:string;event_hash:string}>(),bodyJson=JSON.stringify(body);if(existing){if(existing.event_type!==eventType||existing.subject_id!==subjectId||existing.body_json!==bodyJson)throw new ApiError('state_conflict','Workflow audit event identity was reused.');return existing.event_hash;}
 await auditOutboxStatement(db,userId,eventKey,eventType,subjectId,body,createdAt).run();await flushWorkflowAuditOutbox(db,userId,secret);const saved=await db.prepare('SELECT event_hash FROM workflow_audit_events WHERE user_id=? AND event_key=?').bind(userId,eventKey).first<{event_hash:string}>();if(!saved)throw new ApiError('state_conflict','Workflow audit event was not persisted.');return saved.event_hash;
}

export async function verifyWorkflowAudit(db:D1Database,userId:string,secret:string){
 await flushWorkflowAuditOutbox(db,userId,secret);const checkpoint=await trustedCheckpoint(db,userId,secret),rows=await db.prepare('SELECT event_key,sequence,previous_hash,event_hash,event_type,subject_id,body_json,created_at FROM workflow_audit_events WHERE user_id=? ORDER BY sequence').bind(userId).all<AuditRow>(),ownedJobs=await db.prepare('SELECT COUNT(*) AS count FROM workflow_jobs WHERE user_id=?').bind(userId).first<{count:number}>();let previousHash:string|null=null,sequence=0;
 for(const row of rows.results??[]){sequence+=1;const body=parseBody(row.body_json),expected=await sha256Hex(JSON.stringify({userId,eventKey:row.event_key,sequence,previousHash,eventType:row.event_type,subjectId:row.subject_id,body,createdAt:row.created_at}));if(row.sequence!==sequence||row.previous_hash!==previousHash||row.event_hash!==expected)throw new ApiError('state_conflict','Workflow audit chain is invalid.');previousHash=row.event_hash;}
 if(checkpoint?(checkpoint.event_count!==sequence||checkpoint.head_hash!==previousHash):sequence>0||Number(ownedJobs?.count??0)>0)throw new ApiError('state_conflict','Workflow audit chain does not match its signed checkpoint.');return {valid:true,count:sequence,head:previousHash};
}
