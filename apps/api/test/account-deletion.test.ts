import {describe,it,expect} from 'vitest';
import {testContext,fakeLimiter,type TestContext} from './helpers';
import {signIn,appFor,ghUser} from './sign-in';
import {saveTokens} from '../src/lib/github-tokens';
import {deleteUserUploads} from '../src/routes/highlight';

function uploadFixture(){
 const keys=new Set<string>();let fail=false;let repeating=false;let onDelete:(()=>Promise<void>)|undefined;
 const bucket:R2Bucket={
  async head(){throw new Error('Unused fixture method');},async get(){throw new Error('Unused fixture method');},async put(){throw new Error('Unused fixture method');},
  async createMultipartUpload(){throw new Error('Unused fixture method');},resumeMultipartUpload(){throw new Error('Unused fixture method');},
  async list(options):Promise<R2Objects>{
   if(repeating)return {objects:[],truncated:true,cursor:'repeat',delimitedPrefixes:[]};
   const selected=[...keys].filter(key=>key.startsWith(options?.prefix??'') && (!options?.cursor||key>options.cursor)).sort();
   const objects=selected.slice(0,2).map((key):R2Object=>({key,version:'fixture',size:1,etag:'fixture',httpEtag:'"fixture"',checksums:{toJSON:()=>({})},uploaded:new Date(0),storageClass:'Standard',writeHttpMetadata:()=>{}}));
   const cursor=objects.at(-1)?.key;if(selected.length>2 && cursor)return {objects,truncated:true,cursor,delimitedPrefixes:[]};return {objects,truncated:false,delimitedPrefixes:[]};
  },
  async delete(value){if(fail)throw new Error('Storage unavailable');if(onDelete){const run=onDelete;onDelete=undefined;await run();}for(const key of typeof value==='string'?[value]:value)keys.delete(key);},
 };
 return {bucket,keys,setFailure:(value:boolean)=>{fail=value;},setRepeating:()=>{repeating=true;},duringDelete:(run:()=>Promise<void>)=>{onDelete=run;}};
}
function grants(ctx:TestContext,status=204){ctx.net.on('DELETE','https://api.github.com/applications/',()=>new Response(null,{status}));}
const revokeCount=(ctx:TestContext)=>ctx.net.calls.filter(c=>c.method==='DELETE'&&c.url.startsWith('https://api.github.com/applications/')).length;
async function seedOwned(ctx:TestContext,userId:string){
 const stamp=ctx.time.now().toISOString();const session=ctx.db.rows<{token_hash:string}>('SELECT token_hash FROM sessions WHERE user_id=?',userId)[0]?.token_hash;
 if(typeof session!=='string')throw new Error('Session fixture missing');
 ctx.db.sqlite.prepare('INSERT INTO activity_audit VALUES(?,?,?,?,?,?)').run(userId+':event','fixture/repo',1,'review','reviewer',stamp);
 const statements:[string,unknown[]][]=[
  ['INSERT INTO activity_read VALUES(?,?)',[userId,userId+':event']],
  ['INSERT INTO billing_accounts(user_id,updated_at)VALUES(?,?)',[userId,stamp]],
  ['INSERT INTO repo_watch VALUES(?,?,?,?,?)',[userId,'repo','fixture/repo',1,stamp]],
  ['INSERT INTO notification_state VALUES(?,?,?,?,?,?)',[userId,'item',null,null,stamp,'operation']],
  ['INSERT INTO private_notes VALUES(?,?,?,?,?,?)',[userId,'note','pr:o/r#1','{"kind":"pr"}','private text',stamp]],
  ['INSERT INTO triage_choices VALUES(?,?,?,?)',[userId,'item','fyi',stamp]],
  ['INSERT INTO user_repo_access VALUES(?,?)',[userId,'fixture/repo']],
  ['INSERT INTO user_access_checks VALUES(?,?)',[userId,stamp]],
  ['INSERT INTO consent_grants VALUES(?,?,?,?)',[userId,1,'1',stamp]],
  ['INSERT INTO user_settings VALUES(?,?,?)',[userId,'{}',stamp]],
  ['INSERT INTO user_meta_keys VALUES(?,?,?,?)',[userId,'1','encrypted-fixture',stamp]],
  ['INSERT INTO ai_results_cache VALUES(?,?,?,?,(SELECT revision FROM ai_policy WHERE user_id=?))',[userId+':cache',userId,'{}',stamp,userId]],
  ['INSERT INTO ai_inflight VALUES(?,?,?)',[userId+':inflight',userId,'2099-01-01T00:00:00Z']],
  ['INSERT INTO push_tokens VALUES(?,?,?,?,?)',[userId,'device','ExponentPushToken['+userId+']',session,stamp]],
  ['INSERT INTO push_receipts VALUES(?,?,?,?,?,?)',[userId+':ticket',userId,'device','fixture-hash',stamp,stamp]],
  ['INSERT INTO notification_push VALUES(?,?,?,?,?)',[userId,'notice','review',stamp,'accepted']],
  ['INSERT INTO web_push_subscriptions VALUES(?,?,?,?,?,?,?)',[userId,'browser','https://push.example/'+userId,'fixture-key','fixture-auth',session,stamp]],
  ['INSERT INTO session_lineage VALUES(?,?,?,?,?,?,?,?)',[userId+':spent','family',userId,0,'bearer',null,stamp,'2099-01-01T00:00:00Z']],
  ['INSERT INTO workflow_runs VALUES(?,?,?,?,?,0,NULL,?,?)',[userId+':run',userId,'key','{}','1',stamp,stamp]],
  ['INSERT INTO workflow_jobs(id,run_id,user_id,repository,base_sha,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',[userId+':job',userId+':run',userId,'fixture/repo','a'.repeat(40),stamp,stamp]],
  ['INSERT INTO workflow_audit_events(id,user_id,event_key,sequence,previous_hash,event_hash,event_type,subject_id,body_json,created_at) VALUES(?,?,?,1,NULL,?,?,?,?,?)',[userId+':audit',userId,userId+':audit','hash-'+userId,'job_created',userId+':job','{}',stamp]],
  ['INSERT INTO workflow_audit_outbox(event_key,user_id,event_type,subject_id,body_json,created_at) VALUES(?,?,?,?,?,?)',[userId+':outbox',userId,'job_reported',userId+':job','{}',stamp]],
  ['INSERT INTO workflow_audit_checkpoints(user_id,event_count,head_hash,signature,updated_at) VALUES(?,?,?,?,?)',[userId,1,'hash-'+userId,'fixture-signature',stamp]],
  ['INSERT INTO webauthn_credentials(id,user_id,credential_id,public_key,counter,transports_json,device_type,backed_up,created_at) VALUES(?,?,?,?,?,?,?,?,?)',[userId+':credential-row',userId,userId+':credential','AQ',0,'[]','singleDevice',0,stamp]],
  ['INSERT INTO webauthn_challenges(id,user_id,purpose,challenge,binding_json,expires_at,created_at) VALUES(?,?,?,?,?,?,?)',[userId+':challenge',userId,'approve_patch','fixture-challenge','{}','2099-01-01T00:00:00Z',stamp]],
  ['INSERT INTO workflow_patch_approvals(job_id,user_id,repository_id,head_sha,patch_hash,action,credential_id,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)',[userId+':job',userId,1,'a'.repeat(40),'b'.repeat(64),'qa_and_draft_pr',userId+':credential','2099-01-01T00:00:00Z',stamp]],
  ['INSERT INTO workflow_definitions VALUES(?,?,?,?,?)',[userId+':def',userId,'{}',stamp,stamp]],
 ];
 for(const [sql,args] of statements)await ctx.db.prepare(sql).bind(...args).run();
 for(const scope of [userId,`${userId}:triage`,`${userId}:metakey`])await ctx.db.prepare('INSERT INTO ai_usage_daily VALUES(?,?,?)').bind(scope,'2026-10-27',1).run();
}

describe('complete account deletion',()=>{
 it('atomically clears every user-owned table and paginated uploads, preserving another user and service/audit data',async()=>{
  const ctx=testContext(),a=await signIn(ctx),b=await signIn(ctx,'ios',{...ghUser,id:ghUser.id+1,login:'other-user'});grants(ctx);
  await seedOwned(ctx,a.userId);await seedOwned(ctx,b.userId);
  await ctx.db.prepare('INSERT INTO ai_usage_daily VALUES(?,?,?)').bind('global','2026-10-27',5).run();
  await ctx.db.prepare("INSERT INTO webhook_dead_letters(source,event,failed_at)VALUES('github','fixture',?)").bind(ctx.time.now().toISOString()).run();
  const storage=uploadFixture();ctx.env.HIGHLIGHT_UPLOADS=storage.bucket;for(const key of ['a','b','c'])storage.keys.add(a.userId+'/'+key);storage.keys.add(b.userId+'/kept');
  const tables=ctx.db.rows<{name:string}>("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").flatMap(r=>typeof r.name==='string'?[r.name]:[]).filter(name=>ctx.db.rows<{name:string}>(`PRAGMA table_info(${name})`).some(c=>c.name==='user_id') && name!=='account_deletions');
  for(const name of tables)expect(ctx.db.rows(`SELECT * FROM ${name} WHERE user_id=?`,a.userId),name).not.toHaveLength(0);
  expect((await appFor(ctx)('/v1/account',{method:'DELETE',headers:a.headers})).status).toBe(204);
  for(const name of tables){expect(ctx.db.rows(`SELECT * FROM ${name} WHERE user_id=?`,a.userId),name).toEqual([]);expect(ctx.db.rows(`SELECT * FROM ${name} WHERE user_id=?`,b.userId),name).not.toHaveLength(0);}
  expect(ctx.db.rows('SELECT * FROM users WHERE id=?',a.userId)).toEqual([]);expect(ctx.db.rows('SELECT used FROM ai_usage_daily WHERE scope=?','global')).toEqual([{used:5}]);
  expect(ctx.db.rows('SELECT * FROM ai_usage_daily WHERE scope IN (?,?,?)',a.userId,a.userId+':triage',a.userId+':metakey')).toEqual([]);expect(ctx.db.rows('SELECT * FROM webhook_dead_letters')).toHaveLength(1);expect(storage.keys).toEqual(new Set([b.userId+'/kept']));
  expect(ctx.db.rows('SELECT state,grant_token_hash,lease_token FROM account_deletions WHERE user_id=?',a.userId)).toEqual([{state:'completed',grant_token_hash:null,lease_token:null}]);
  expect((await appFor(ctx)('/v1/me',{headers:a.headers})).status).toBe(401);expect((await appFor(ctx)('/v1/account',{method:'DELETE',headers:a.headers})).status).toBe(401);expect((await appFor(ctx)('/v1/me',{headers:b.headers})).status).toBe(200);
 });
 it.each([401,404,422,500])('does not mistake GitHub status%s for confirmed revocation',async status=>{
  const ctx=testContext(),s=await signIn(ctx);grants(ctx,status);const call=appFor(ctx);
  expect((await call('/v1/account',{method:'DELETE',headers:s.headers})).status).toBe(502);expect(ctx.db.rows('SELECT id FROM users')).toHaveLength(1);
  expect(await (await call('/v1/me',{headers:s.headers})).json()).toMatchObject({deletionPending:true});expect((await call('/v1/settings',{headers:s.headers})).status).toBe(403);
  grants(ctx);expect((await call('/v1/account',{method:'DELETE',headers:s.headers})).status).toBe(204);
 });
 it('resumes after storage failure without retrying a grant already confirmed revoked',async()=>{
  const ctx=testContext(),s=await signIn(ctx);grants(ctx);const storage=uploadFixture();ctx.env.HIGHLIGHT_UPLOADS=storage.bucket;storage.keys.add(s.userId+'/image');storage.setFailure(true);
  expect((await appFor(ctx)('/v1/account',{method:'DELETE',headers:s.headers})).status).toBe(500);expect(ctx.db.rows('SELECT id FROM users')).toHaveLength(1);expect(revokeCount(ctx)).toBe(1);
  grants(ctx,422);storage.setFailure(false);expect((await appFor(ctx)('/v1/account',{method:'DELETE',headers:s.headers})).status).toBe(204);expect(revokeCount(ctx)).toBe(1);expect(storage.keys.size).toBe(0);
 });
 it('rejects concurrent deletion attempts while one external revocation is in flight',async()=>{
  const ctx=testContext(),s=await signIn(ctx);let release=()=>{};let began=()=>{};const started=new Promise<void>(r=>{began=r;});const hold=new Promise<void>(r=>{release=r;});
  ctx.net.on('DELETE','https://api.github.com/applications/',async()=>{began();await hold;return new Response(null,{status:204});});
  const first=appFor(ctx)('/v1/account',{method:'DELETE',headers:s.headers});await started;const duplicate=await appFor(ctx)('/v1/account',{method:'DELETE',headers:s.headers});expect(duplicate.status).toBe(429);expect(duplicate.headers.get('retry-after')).toBe('2');release();expect((await first).status).toBe(204);expect(revokeCount(ctx)).toBe(1);
 });
 it('fences a newly authorized GitHub token during cleanup and revokes that token on retry',async()=>{
  const ctx=testContext(),s=await signIn(ctx);grants(ctx);const storage=uploadFixture();ctx.env.HIGHLIGHT_UPLOADS=storage.bucket;storage.keys.add(s.userId+'/image');
  storage.duringDelete(()=>saveTokens(ctx.env,s.userId,{accessToken:'ghu_new_fixture',accessExpiresAt:'2099-01-01T00:00:00Z',refreshToken:null,refreshExpiresAt:null},ctx.time.now()));
  expect((await appFor(ctx)('/v1/account',{method:'DELETE',headers:s.headers})).status).toBe(502);expect(ctx.db.rows('SELECT id FROM users')).toHaveLength(1);
  expect((await appFor(ctx)('/v1/account',{method:'DELETE',headers:s.headers})).status).toBe(204);expect(revokeCount(ctx)).toBe(2);
 });
 it('rolls back local cleanup on database failure and permits a confirmed-grant retry',async()=>{
  const ctx=testContext(),s=await signIn(ctx);grants(ctx);await seedOwned(ctx,s.userId);ctx.db.sqlite.exec("CREATE TRIGGER fixture_fail_delete BEFORE DELETE ON users BEGIN SELECT RAISE(ABORT,'fixture rollback'); END;");
  expect((await appFor(ctx)('/v1/account',{method:'DELETE',headers:s.headers})).status).toBe(500);expect(ctx.db.rows('SELECT * FROM ai_usage_daily WHERE scope=?',s.userId)).toHaveLength(1);
  ctx.db.sqlite.exec('DROP TRIGGER fixture_fail_delete');expect((await appFor(ctx)('/v1/account',{method:'DELETE',headers:s.headers})).status).toBe(204);expect(revokeCount(ctx)).toBe(1);
 });
 it('keeps unauthenticated and CSRF-failing requests from starting deletion',async()=>{
  const ctx=testContext();expect((await appFor(ctx)('/v1/account',{method:'DELETE'})).status).toBe(401);const session=await signIn(ctx,'web');grants(ctx);
  expect((await appFor(ctx)('/v1/account',{method:'DELETE',headers:session.headers})).status).toBe(403);expect(ctx.db.rows('SELECT * FROM account_deletions')).toEqual([]);expect(revokeCount(ctx)).toBe(0);
  const success=await appFor(ctx)('/v1/account',{method:'DELETE',headers:{...session.headers,'x-csrf-token':session.csrf??''}});expect(success.status).toBe(204);expect(success.headers.get('set-cookie')).toContain('Max-Age=0');
 });
 it('supports reauthorization to finish a deletion with missing GitHub credentials',async()=>{
  const ctx=testContext(),first=await signIn(ctx);await ctx.db.prepare('DELETE FROM github_tokens WHERE user_id=?').bind(first.userId).run();
  expect((await appFor(ctx)('/v1/account',{method:'DELETE',headers:first.headers})).status).toBe(502);expect(ctx.db.rows('SELECT id FROM users')).toHaveLength(1);
  const recovered=await signIn(ctx);expect(recovered.userId).toBe(first.userId);expect(recovered.body.user).toMatchObject({deletionPending:true});expect((await appFor(ctx)('/v1/auth/refresh',{method:'POST',headers:recovered.headers})).status).toBe(403);grants(ctx);
  expect((await appFor(ctx)('/v1/account',{method:'DELETE',headers:recovered.headers})).status).toBe(204);expect((await appFor(ctx)('/v1/me',{headers:first.headers})).status).toBe(401);
 });
 it('permits deletion for a suspended owner with an existing session and an exhausted session quota',async()=>{
  const ctx=testContext(),s=await signIn(ctx);grants(ctx);ctx.env.SESSION_RATE_LIMITER=fakeLimiter(0);await ctx.db.prepare("UPDATE users SET status='suspended' WHERE id=?").bind(s.userId).run();expect((await appFor(ctx)('/v1/account',{method:'DELETE',headers:s.headers})).status).toBe(204);
 });
 it('fails safely on repeated R2 pagination cursors',async()=>{const storage=uploadFixture();storage.setRepeating();await expect(deleteUserUploads({HIGHLIGHT_UPLOADS:storage.bucket},'fixture')).rejects.toMatchObject({code:'upstream_unavailable'});});
});
