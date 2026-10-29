import {describe,it,expect} from 'vitest';
import {PrSearchFilters,PrSearchPage} from '@mergemate/contracts';
import {testContext,json,fakeAi,type RecordedCall} from './helpers';
import {appFor,signIn} from './sign-in';
import {getSettings} from '../src/lib/settings';
import {githubSearchQuery} from '../src/routes/search';
const sha='a'.repeat(40),otherSha='b'.repeat(40);
const hit=(n:number,date='2026-10-27T10:00:00Z',repo='acme/api',author='fixture')=>({number:n,title:`Fix item ${n}`,state:'open',draft:false,user:{login:author},updated_at:date,repository_url:'https://api.github.com/repos/'+repo,pull_request:{merged_at:null}});
async function setup(){const ctx=testContext(),models=fakeAi(),session=await signIn(ctx),call=appFor(ctx);ctx.env.AI=models;ctx.net.on('GET','https://api.github.com/search/issues?',()=>json({total_count:40,items:[hit(1),hit(2)]}));await ctx.db.prepare('INSERT INTO consent_grants(user_id,granted,version,at) VALUES(?,1,?,?)').bind(session.userId,'1',ctx.time.now().toISOString()).run();const search=(query='',headers=session.headers)=>call('/v1/search/prs'+query,{headers});const page=async(query='')=>PrSearchPage.parse(await(await search(query)).json());const cache=async(n:number,level='high',user=session.userId,revision=sha)=>ctx.db.prepare('INSERT INTO ai_results_cache(key,user_id,body,created_at,policy_revision) VALUES(?,?,?,?,(SELECT revision FROM ai_policy WHERE user_id=?))').bind(`${user}:risk:acme/api#${n}@${revision}`,user,JSON.stringify({level,reasons:['Fixture saved assessment'],coverage:{analyzedFiles:1,skippedFiles:0,truncatedFiles:0}}),ctx.time.now().toISOString(),user).run();return {ctx,session,call,search,page,cache,models};}
describe('authorized PR search',()=>{
 it('pushes literal title, repository, author and inclusive UTC days upstream',async()=>{
  const filters=PrSearchFilters.parse({query:'Fix auth',repo:'acme/api',author:'fixture',from:'2026-02-28',to:'2026-02-28'});expect(githubSearchQuery(filters)).toBe('is:pr is:open archived:false "Fix" "auth" in:title repo:acme/api author:fixture updated:>=2026-02-28T00:00:00Z updated:<2026-03-01T00:00:00Z');
  const {ctx,page}=await setup();await page('?query=Fix&repo=acme%2Fapi&author=fixture');const request=ctx.net.calls.find(c=>c.url.includes('/search/issues?'));expect(decodeURIComponent(request?.url??'')).toContain('"Fix" in:title repo:acme/api author:fixture');expect(request?.url).toContain('per_page=20&page=1');
 });
 it('rejects operators, malformed/overflow dates, reversed ranges and unknown filters before GitHub',async()=>{
  const {ctx,search}=await setup();for(const query of ['?query=repo%3Aprivate%2Fsecret','?query=%22oops','?from=2026-02-30','?from=garbage','?from=2026-02-28&to=2026-02-27','?repo=acme%2F..','?author=bad%3Aauthor','?unknown=1'])expect((await search(query)).status,query).toBe(422);expect(ctx.net.calls.filter(c=>c.url.includes('/search/issues?'))).toHaveLength(0);
 });
 it('applies UTC date boundaries and structured filters even to unexpected upstream rows',async()=>{
  const {ctx,page}=await setup();ctx.net.on('GET','https://api.github.com/search/issues?',()=>json({total_count:5,items:[hit(1,'2026-10-26T23:59:59Z'),hit(2,'2026-10-27T00:00:00Z'),hit(3,'2026-10-27T23:59:59Z'),hit(4,'2026-10-28T00:00:00Z'),hit(5,'2026-10-27T12:00:00Z','other/repo')]}));expect((await page('?from=2026-10-27&to=2026-10-27&repo=acme%2Fapi')).items.map(r=>r.number)).toEqual([3,2]);
 });
 it('continues a risk-filtered empty page and only uses owned current-commit assessments',async()=>{
  const {ctx,session,page,cache,models}=await setup();await cache(1,'high',session.userId,otherSha);await cache(3);
  ctx.net.on('GET','https://api.github.com/repos/acme/api/pulls/',()=>json({head:{sha}}));ctx.net.on('GET','https://api.github.com/search/issues?',(request:RecordedCall)=>json({total_count:40,items:request.url.endsWith('page=1')?[hit(1),hit(2)]:[hit(3),hit(4)]}));
  const first=await page('?risk=high');expect(first.items).toEqual([]);expect(first.nextCursor).not.toBeNull();const second=await page('?risk=high&cursor='+encodeURIComponent(first.nextCursor??''));expect(second.items.map(r=>r.number)).toEqual([3]);expect(second.items[0]?.risk).toBe('high');expect(models.runs).toHaveLength(0);
 });
 it('labels missing, invalid and old-commit saved risk as unassessed without models',async()=>{
  const {ctx,session,page,cache,models}=await setup();await cache(1,'low',session.userId,otherSha);await cache(2);await ctx.db.prepare('UPDATE ai_results_cache SET body=? WHERE key=?').bind('invalid-json',`${session.userId}:risk:acme/api#2@${sha}`).run();ctx.net.on('GET','https://api.github.com/repos/acme/api/pulls/',()=>json({head:{sha}}));expect((await page('?risk=unassessed')).items).toHaveLength(2);expect(models.runs).toHaveLength(0);
 });
 it('checks current access, isolates cached results and preserves consent/settings gates',async()=>{
  const {ctx,page,cache,search,session}=await setup();await cache(1);ctx.net.on('GET','https://api.github.com/repos/acme/api/pulls/',()=>json({message:'Not found'},404));expect((await page('?risk=high')).items).toEqual([]);
  const other=await signIn(ctx,'ios',{id:777,login:'other',name:null,avatar_url:'https://avatars.githubusercontent.com/u/777'});expect((await search('?risk=high',other.headers)).status).toBe(403);await ctx.db.prepare('INSERT INTO consent_grants(user_id,granted,version,at) VALUES(?,1,?,?)').bind(other.userId,'1',ctx.time.now().toISOString()).run();ctx.net.on('GET','https://api.github.com/repos/acme/api/pulls/',()=>json({head:{sha}}));expect(PrSearchPage.parse(await(await search('?risk=high',other.headers)).json()).items).toEqual([]);
  await ctx.db.prepare('UPDATE consent_grants SET granted=0 WHERE user_id=?').bind(session.userId).run();expect((await search('?risk=high')).status).toBe(403);
  const settings=await getSettings(ctx.env,session.userId);await ctx.db.prepare('INSERT INTO user_settings(user_id,settings,updated_at) VALUES(?,?,?)').bind(session.userId,JSON.stringify({...settings,aiSummaries:false}),ctx.time.now().toISOString()).run();expect((await search('?risk=unassessed')).status).toBe(403);expect((await search('?risk=all')).status).toBe(200);expect((await search('',{})).status).toBe(401);
 });
 it('bounds risk work to20 candidates and surfaces incomplete/capped upstream search',async()=>{
  const {ctx,page}=await setup();ctx.net.on('GET','https://api.github.com/search/issues?',()=>json({total_count:1200,incomplete_results:true,items:Array.from({length:25},(_,i)=>hit(i+1))}));ctx.net.on('GET','https://api.github.com/repos/acme/api/pulls/',()=>json({head:{sha}}));const result=await page('?risk=unassessed');expect(result).toMatchObject({candidates:20,incomplete:true,capped:true});expect(ctx.net.calls.filter(c=>c.url.includes('/pulls/'))).toHaveLength(20);expect(ctx.net.calls.filter(c=>c.url.includes('/search/issues?'))).toHaveLength(1);
  const decoded=JSON.parse(Buffer.from(result.nextCursor??'','base64url').toString());decoded.page=50;expect((await page('?risk=unassessed&cursor='+Buffer.from(JSON.stringify(decoded)).toString('base64url'))).nextCursor).toBeNull();
 });
 it('propagates incoming cancellation to both bounded GitHub attempts',async()=>{
  const {ctx,call,session}=await setup(),cancel=new AbortController(),signals:boolean[]=[];cancel.abort();ctx.deps.fetch=async(input,init)=>{signals.push(init?.signal?.aborted===true);throw new Error('fixture cancelled');};const response=await call('/v1/search/prs',{headers:session.headers,signal:cancel.signal});expect(response.status).toBe(502);expect(signals).toEqual([true,true]);
 });
 it('scopes cursors to user and filters, deduplicates latest revisions and orders ties',async()=>{
  const {ctx,page,search}=await setup();ctx.net.on('GET','https://api.github.com/search/issues?',()=>json({total_count:40,items:[hit(2),hit(1),hit(2,'2026-10-27T11:00:00Z'),hit(3)]}));const result=await page();expect(result.items[0]?.number).toBe(2);expect(result.items.slice(1).map(r=>r.id)).toEqual(result.items.slice(1).map(r=>r.id).sort());const cursor=encodeURIComponent(result.nextCursor??'');expect((await search('?author=other&cursor='+cursor)).status).toBe(422);const other=await signIn(ctx,'ios',{id:888,login:'other',name:null,avatar_url:'https://avatars.githubusercontent.com/u/888'});expect((await search('?cursor='+cursor,other.headers)).status).toBe(422);expect((await search('?cursor=not-a-cursor')).status).toBe(422);
 });
});
