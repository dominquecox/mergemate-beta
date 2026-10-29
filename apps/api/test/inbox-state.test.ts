import {describe,it,expect} from 'vitest';
import {InboxReceipt,NotificationPage} from '@mergemate/contracts';
import {testContext,json} from './helpers';
import {appFor,post,signIn} from './sign-in';
import {notificationId} from '../src/lib/notification-id';
const id=notificationId('acme/api',7),observed='2026-10-27T10:00:00Z';
const input=(action:'done'|'snooze'|'restore',expectedOperationId:string|null=null)=>({operationId:crypto.randomUUID(),expectedOperationId,action,observedUpdatedAt:observed,...(action==='snooze'?{durationMinutes:1}:{})});
async function setup(){
 const ctx=testContext(),session=await signIn(ctx),call=appFor(ctx);ctx.net.on('GET','https://api.github.com/repos/acme/api/pulls/7',()=>json({updated_at:observed}));
 const search=(updated=observed)=>ctx.net.on('GET','https://api.github.com/search/issues?',()=>json({total_count:100,items:[{number:7,title:'Private review',state:'open',user:{login:'fixture'},updated_at:updated,repository_url:'https://api.github.com/repos/acme/api',pull_request:{merged_at:null}}]}));search();
 const mutate=(body:unknown,headers=session.headers)=>call(`/v1/notifications/${id}/state`,post(body,headers));
 const list=async(headers=session.headers,query='?filter=review')=>NotificationPage.parse(await(await call('/v1/notifications'+query,{headers})).json());
 return {ctx,session,call,mutate,list,search};
}
describe('conditional Inbox operations',()=>{
 it('makes Done idempotent, conditional Undo replay-safe, and new revisions visible',async()=>{
  const {ctx,mutate,list,search}=await setup(),done=input('done');
  const receipt=InboxReceipt.parse(await(await mutate(done)).json());expect((await list()).items).toEqual([]);
  ctx.time.advance(1000);expect(await(await mutate(done)).json()).toEqual(receipt);
  const undo=input('restore',receipt.operationId);const restored=InboxReceipt.parse(await(await mutate(undo)).json());expect((await list()).items[0]?.stateToken).toBe(restored.operationId);
  expect((await mutate(done)).status).toBe(409);expect((await list()).items).toHaveLength(1);
  const again=input('done',restored.operationId);await mutate(again);search('2026-10-27T11:00:00Z');expect((await list()).items).toHaveLength(1);
 });
 it('recovers the last conditional Undo after a client reload and keeps it absent after restore',async()=>{
  const {call,mutate,session}=await setup();const done=InboxReceipt.parse(await(await mutate(input('done'))).json());
  expect(await(await call('/v1/inbox/undo',{headers:session.headers})).json()).toEqual({itemId:id,receipt:done});
  await mutate(input('restore',done.operationId));expect(await(await call('/v1/inbox/undo',{headers:session.headers})).json()).toBeNull();
 });
 it('does not let a late Undo overwrite a newer device action',async()=>{
  const {mutate,list}=await setup();const first=InboxReceipt.parse(await(await mutate(input('done'))).json());const snoozed=InboxReceipt.parse(await(await mutate(input('snooze',first.operationId))).json());
  expect((await mutate(input('restore',first.operationId))).status).toBe(409);expect((await list()).items).toEqual([]);
  expect((await mutate(input('restore',snoozed.operationId))).status).toBe(200);expect((await list()).items).toHaveLength(1);
 });
 it('admits one of concurrent mutations with the same predecessor',async()=>{
  const {mutate}=await setup();const responses=await Promise.all([mutate(input('done')),mutate(input('snooze'))]);expect(responses.map(r=>r.status).sort()).toEqual([200,409]);
 });
 it('uses server time for snooze, preserves retry timestamps and wakes at the boundary',async()=>{
  const {ctx,mutate,list}=await setup();const snooze=input('snooze');const receipt=InboxReceipt.parse(await(await mutate(snooze)).json());const page=await list();expect(page.items).toEqual([]);expect(page.refreshAt).toBe(receipt.snoozedUntil);expect(page.serverTime).toBe(ctx.time.now().toISOString());
  ctx.time.advance(30000);expect(await(await mutate(snooze)).json()).toEqual(receipt);ctx.time.advance(30000);expect((await list()).items).toHaveLength(1);
 });
 it('rejects inaccessible repositories, malformed ids, future revisions and missing CAS fields',async()=>{
  const {ctx,call,mutate,session}=await setup();expect((await mutate({action:'done'})).status).toBe(422);expect((await mutate({...input('done'),observedUpdatedAt:'2099-01-01T00:00:00Z'})).status).toBe(422);
  expect((await call('/v1/notifications/abcdefgh/state',post(input('done'),session.headers))).status).toBe(422);
  ctx.net.on('GET','https://api.github.com/repos/acme/api/pulls/7',()=>json({message:'Not Found'},404));expect((await mutate(input('done'))).status).toBe(404);expect(ctx.db.rows('SELECT * FROM notification_state')).toEqual([]);
 });
 it('prevents legacy writes from silently clobbering a receipt-managed state',async()=>{
  const {call,mutate,session}=await setup();await mutate(input('done'));
  for(const action of ['done','restore'])expect((await call(`/v1/notifications/${id}/${action}`,post({},session.headers))).status).toBe(409);
  expect((await call(`/v1/notifications/${id}/snooze`,post({until:'2026-10-28T10:00:00Z'},session.headers))).status).toBe(409);
 });
 it('scopes receipts and preferences to the account, validates filter input and cascades cleanup',async()=>{
  const {ctx,call,session,mutate,list}=await setup();const a=InboxReceipt.parse(await(await mutate(input('done'))).json());const b=await signIn(ctx,'ios',{id:9999,login:'other',name:null,avatar_url:'https://avatars.githubusercontent.com/u/9999'});
  expect((await list(b.headers)).items).toHaveLength(1);expect((await mutate(input('restore',a.operationId),b.headers)).status).toBe(409);
  expect((await call('/v1/inbox/preference',{...post({filter:'mentions'},session.headers),method:'PUT'})).status).toBe(200);expect(await(await call('/v1/inbox/preference',{headers:session.headers})).json()).toEqual({filter:'mentions'});expect(await(await call('/v1/inbox/preference',{headers:b.headers})).json()).toEqual({filter:'all'});
  expect((await call('/v1/inbox/preference',{...post({filter:'wrong'},session.headers),method:'PUT'})).status).toBe(422);
  await ctx.db.prepare('DELETE FROM users WHERE id=?').bind(session.userId).run();expect(ctx.db.rows('SELECT * FROM inbox_preferences')).toEqual([]);expect(ctx.db.rows('SELECT * FROM notification_state')).toEqual([]);
 });
 it('rejects cursor reuse under another filter/account/limit, yet performs fresh user-token searches',async()=>{
  const {ctx,call,session,list}=await setup();const page=await list();const cursor=encodeURIComponent(page.nextCursor??'');expect(cursor.length).toBeGreaterThan(10);
  expect((await call(`/v1/notifications?filter=mine&cursor=${cursor}`,{headers:session.headers})).status).toBe(422);expect((await call(`/v1/notifications?filter=review&limit=1&cursor=${cursor}`,{headers:session.headers})).status).toBe(422);
  const b=await signIn(ctx,'ios',{id:9999,login:'other',name:null,avatar_url:'https://avatars.githubusercontent.com/u/9999'});expect((await call(`/v1/notifications?filter=review&cursor=${cursor}`,{headers:b.headers})).status).toBe(422);
  ctx.net.on('GET','https://api.github.com/search/issues?',()=>json({total_count:0,items:[]}));expect((await list(session.headers,`?filter=review&cursor=${cursor}`)).items).toEqual([]);
 });
 it('keeps the newest duplicate revision and sorts equal timestamps deterministically without AI',async()=>{
  const {ctx,session,call}=await setup();const result=(number:number,updated:string)=>({number,title:'fixture',state:'open',user:{login:'fixture'},updated_at:updated,repository_url:'https://api.github.com/repos/acme/api'});
  ctx.net.on('GET','https://api.github.com/search/issues?',(request:{url:string})=>json({total_count:2,items:request.url.includes('review-requested')?[result(7,observed),result(8,observed)]:[result(7,'2026-10-27T11:00:00Z')]}));
  const page=NotificationPage.parse(await(await call('/v1/notifications',{headers:session.headers})).json());expect(page.items[0]).toMatchObject({number:7,kind:'review',updatedAt:'2026-10-27T11:00:00Z'});expect(ctx.net.calls.some(c=>c.url.includes('/responses'))).toBe(false);
 });
});
