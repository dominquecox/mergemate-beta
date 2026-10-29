import {describe,it,expect} from 'vitest';
import {testContext,fakeLimiter} from './helpers';
import {signIn,appFor} from './sign-in';
import {claimDeletion,releaseDeletion,deletionPending,purgeDeletionTombstones} from '../src/lib/account-deletion';
import {createDbUsageStore,createDbCache} from '../src/routes/ai-engine';

describe('account deletion fencing',()=>{
 it('serializes duplicate attempts and fences a stale lease owner',async()=>{
  const ctx=testContext(),s=await signIn(ctx);const first=await claimDeletion(ctx.env.DB,s.userId,ctx.time.now());
  expect(await deletionPending(ctx.env.DB,s.userId)).toBe(true);
  await expect(claimDeletion(ctx.env.DB,s.userId,ctx.time.now())).rejects.toMatchObject({code:'rate_limited'});
  ctx.time.advance(10*60_000+1);const second=await claimDeletion(ctx.env.DB,s.userId,ctx.time.now());expect(second).not.toBe(first);
  await releaseDeletion(ctx.env.DB,s.userId,first);expect(ctx.db.rows('SELECT lease_token FROM account_deletions')).toEqual([{lease_token:second}]);
  await releaseDeletion(ctx.env.DB,s.userId,second);await expect(claimDeletion(ctx.env.DB,s.userId,ctx.time.now())).resolves.toBeTypeOf('string');
 });
 it('blocks late user budget/cache writes without disturbing global budgets',async()=>{
  const ctx=testContext(),s=await signIn(ctx);await claimDeletion(ctx.env.DB,s.userId,ctx.time.now());const usage=createDbUsageStore(ctx.env.DB);
  for(const scope of [s.userId,`${s.userId}:triage`,`${s.userId}:metakey`])expect(await usage.reserve(scope,10)).toBeNull();
  expect(await usage.reserve('global',10)).not.toBeNull();await createDbCache(ctx.env.DB).set('late-result',s.userId,{summary:'fixture'});
  expect(ctx.db.rows('SELECT * FROM ai_results_cache')).toEqual([]);
 });
 it('still charges blocked private calls while permitting rate-limited deletion recovery',async()=>{
  const ctx=testContext(),s=await signIn(ctx);await claimDeletion(ctx.env.DB,s.userId,ctx.time.now());ctx.env.SESSION_RATE_LIMITER=fakeLimiter(1);const call=appFor(ctx);
  expect((await call('/v1/settings',{headers:s.headers})).status).toBe(403);expect((await call('/v1/settings',{headers:s.headers})).status).toBe(429);expect((await call('/v1/me',{headers:s.headers})).status).toBe(200);
 });
 it('retains pending jobs and only expires completed tombstones after seven days',async()=>{
  const ctx=testContext(),s=await signIn(ctx);await claimDeletion(ctx.env.DB,s.userId,ctx.time.now());await purgeDeletionTombstones(ctx.env.DB,new Date(ctx.time.now().getTime()+8*24*60*60_000));expect(await deletionPending(ctx.env.DB,s.userId)).toBe(true);
  await ctx.db.prepare("UPDATE account_deletions SET state='completed',completed_at=?,grant_token_hash=NULL").bind(ctx.time.now().toISOString()).run();
  await purgeDeletionTombstones(ctx.env.DB,new Date(ctx.time.now().getTime()+6*24*60*60_000));expect(ctx.db.rows('SELECT * FROM account_deletions')).toHaveLength(1);
  await purgeDeletionTombstones(ctx.env.DB,new Date(ctx.time.now().getTime()+8*24*60*60_000));expect(ctx.db.rows('SELECT * FROM account_deletions')).toHaveLength(0);
 });
});
