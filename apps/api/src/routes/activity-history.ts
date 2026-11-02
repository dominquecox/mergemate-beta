import {Hono} from 'hono';
import type {AppEnv} from '../env';
import {requireBinding} from '../config';
import {ApiError} from '../errors';
import {base64url,sha256Hex} from '../lib/crypto';
import {refreshRepoAccess} from '../lib/repo-access';
import {getAccessToken} from '../lib/github-tokens';
import {githubGet} from '../lib/github';

/** Content-free event history, distinct from the open-PR inbox. No actor inferred from author. */
export const activityHistory=new Hono<AppEnv>().get('/activity/history',async c=>{
 const session=c.get('session');if(session.demo)return c.json({items:[],nextCursor:null});
 const uid=session.userId;if(!uid)throw new ApiError('unauthorized','Sign in.');
 const filter=c.req.query('filter')??'all';if(!['all','review','mentions','mine'].includes(filter))throw new ApiError('validation_failed','Invalid filter.');
 const scope=await sha256Hex(JSON.stringify([uid,filter]));let until=c.get('deps').now().toISOString(),at:string|null=null,id='';
 const raw=c.req.query('cursor');if(raw){try{if(raw.length>512)throw new Error();const v=JSON.parse(atob(raw.replace(/-/g,'+').replace(/_/g,'/'))) as {scope:string;until:string;at:string;id:string};if(v.scope!==scope||!Number.isFinite(Date.parse(v.until))||!Number.isFinite(Date.parse(v.at))||typeof v.id!=='string'||v.id.length>100||Date.parse(v.until)>Date.parse(until))throw new Error();until=v.until;at=v.at;id=v.id;}catch{throw new ApiError('validation_failed','Invalid history cursor.');}}
 await refreshRepoAccess(c,uid);
 const db=requireBinding(c.env,'DB');
 const rows=await db.prepare(`SELECT a.*,CASE WHEN r.event_id IS NULL THEN 0 ELSE 1 END AS is_read FROM activity_audit a
 JOIN user_repo_access p ON p.user_id=?1 AND p.full_name=a.repo_full_name COLLATE NOCASE
 LEFT JOIN activity_read r ON r.user_id=?1 AND r.event_id=a.id
 WHERE a.received_at<=?2 AND a.received_at>?3 AND (?4 IS NULL OR a.received_at<?4 OR (a.received_at=?4 AND a.id>?5))
 AND (?6='all' OR (?6='review' AND a.event='review'))
 AND NOT EXISTS(SELECT 1 FROM repo_watch w WHERE w.user_id=?1 AND w.full_name=a.repo_full_name COLLATE NOCASE AND w.watching=0)
 ORDER BY a.received_at DESC,a.id ASC LIMIT 51`).bind(uid,until,new Date(Date.parse(until)-7*86400000).toISOString(),at,id,filter).all<{id:string;repo_full_name:string;number:number;event:string;actor:string|null;received_at:string;is_read:number}>();
 const page=rows.results.slice(0,50),last=page.at(-1);
 return c.json({items:page.map(row=>({id:row.id,repo:row.repo_full_name,number:row.number,title:`Pull request #${row.number}`,author:'unknown',actor:row.actor,event:row.event,kind:row.event==='review'?'review' as const:'mine' as const,status:'open' as const,updatedAt:row.received_at,read:!!row.is_read})),nextCursor:rows.results.length>50&&last?base64url(new TextEncoder().encode(JSON.stringify({scope,until,at:last.received_at,id:last.id}))):null});
}).post('/activity/history/:id/read',async c=>{
 const uid=c.get('session').userId;if(!uid||c.get('session').demo)throw new ApiError('forbidden','Sign in.');
 const id=c.req.param('id');if(id.length>100)throw new ApiError('validation_failed','Invalid event.');
 const db=requireBinding(c.env,'DB'),row=await db.prepare('SELECT repo_full_name,number FROM activity_audit WHERE id=?').bind(id).first<{repo_full_name:string;number:number}>();
 if(!row)throw new ApiError('not_found','Event unavailable.');
 const token=await getAccessToken(c.env,uid,c.get('deps').now());
 await githubGet(c.get('deps'),token,`/repos/${row.repo_full_name}/pulls/${row.number}`);
 await db.prepare('INSERT INTO activity_read(user_id,event_id) VALUES(?,?) ON CONFLICT DO NOTHING').bind(uid,id).run();
 return c.body(null,204);
});
