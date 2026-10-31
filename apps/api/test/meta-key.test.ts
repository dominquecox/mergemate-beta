import { describe, expect, it } from 'vitest';
import { MetaKeyInput, MetaKeyStatus } from '@mergemate/contracts';
import { createTokenCipher } from '../src/lib/crypto';
import { metaKeyStatus, saveMetaKey, userModelContext } from '../src/lib/user-meta-key';
import { assessPrRisk, createDbUsageStore, summarizePr } from '../src/routes/ai-engine';
import { createDbConsentStore } from '../src/routes/consent';
import type { SessionRecord } from '../src/lib/sessions';
import { appFor, ghUser, post, signIn } from './sign-in';
import { demoHeaders } from './demo-session';
import { fakeAi, fakeLimiter, json, mockTransport, testContext, validModelEnv } from './helpers';

const url='https://api.meta.ai/v1/responses';
const key=(n=1)=>`fixture-meta-user-${n}-not-real`;
const ref={owner:'acme',repo:'api',number:7};
const summary={whatChanged:'x',whyItMatters:'y',suggestedFocus:['src/a.ts']};
const risk={level:'low',reasons:['small change']};
async function fixture() {
  const ctx=testContext({...validModelEnv()});const web=await signIn(ctx,'web');const call=appFor(ctx);
  const headers={...web.headers,origin:'http://localhost:8081','x-csrf-token':web.csrf??''};
  ctx.net.on('POST',url,{object:'response',status:'incomplete',output:[]});
  const put=(value:unknown={key:key()})=>call('/v1/settings/meta-key',{...post(value,headers),method:'PUT'});
  return {ctx,web,call,headers,put};
}
const record=(id:string):SessionRecord=>({userId:id,demo:false,tokenHash:'fixture',transport:'bearer',csrfToken:null,expiresAt:'2099-01-01',userStatus:'active'});
const source=async()=>({title:'Example',description:'Example change',headSha:'aaa',files:[{path:'src/a.ts',patch:'+x',additions:1,deletions:0}],authorIsBot:false,coAuthoredByBot:false,hasTests:true,checksFailing:false});
const sends=(ctx:ReturnType<typeof testContext>)=>ctx.net.calls.filter(call=>call.url===url);

describe('user Meta key settings',()=>{
  it('limits key checks per user per day, counting rejected keys',async()=>{
    const {ctx,put}=await fixture();
    for(let i=0;i<10;i++)expect((await put({key:key(i+1)})).status).toBe(200);
    const before=sends(ctx).length;
    const blocked=await put({key:key(99)});
    expect(blocked.status).toBe(429);
    expect(sends(ctx)).toHaveLength(before);
  });
  it('defines strict input-only secret and status-only output contracts',()=>{
    expect(MetaKeyInput.safeParse({key:key(),userId:'another'}).success).toBe(false);
    expect(MetaKeyStatus.safeParse({configured:true,key:key()}).success).toBe(false);
  });
  it('verifies once with a one-token fixed prompt and stores only versioned ciphertext',async()=>{
    const {ctx,web,call,headers,put}=await fixture();
    expect(await (await call('/v1/settings/meta-key',{headers})).json()).toEqual({configured:false});
    const response=await put();expect(response.status).toBe(200);expect(await response.json()).toEqual({configured:true});
    const calls=sends(ctx);expect(calls).toHaveLength(1);expect(calls[0]?.headers.get('authorization')).toBe(`Bearer ${key()}`);
    expect(calls[0]?.headers.get('cf-aig-collect-log')).toBe('false');
    expect(calls[0]?.headers.get('cf-aig-skip-cache')).toBe('true');expect(calls[0]?.headers.get('cf-aig-max-attempts')).toBe('1');expect(calls[0]?.headers.get('cf-aig-no-wholesale')).toBe('true');
    expect(JSON.parse(calls[0]?.body??'{}')).toEqual({model:'muse-spark-1.2',input:'Reply OK.',max_output_tokens:16,reasoning:{effort:'low'},store:false});
    const first=ctx.db.rows<{ciphertext:string;key_version:string}>('SELECT ciphertext,key_version FROM user_meta_keys')[0];
    expect(first?.key_version).toBe(ctx.env.TOKEN_ENCRYPTION_KEY?.split(':')[0]);expect(JSON.stringify(ctx.db.rows('SELECT * FROM user_meta_keys'))).not.toContain(key());
    const cipher=await createTokenCipher(ctx.env);
    expect(await cipher.decrypt(first?.key_version??'',first?.ciphertext??'',`meta:${web.userId}:key`)).toBe(key());
    await put();const second=ctx.db.rows<{ciphertext:string}>('SELECT ciphertext FROM user_meta_keys')[0];
    expect(second?.ciphertext).not.toBe(first?.ciphertext);
    const status=await call('/v1/settings/meta-key',{headers});expect(status.headers.get('cache-control')).toBe('no-store');expect(await status.json()).toEqual({configured:true});
  });
  it('lets iOS read status, but blocks native entry and deletion',async()=>{
    const {ctx,put}=await fixture();await put();const native=await signIn(ctx);
    const call=appFor(ctx);expect(await (await call('/v1/settings/meta-key',{headers:native.headers})).json()).toEqual({configured:true});
    for(const method of ['PUT','DELETE'])expect((await call('/v1/settings/meta-key',{...post({key:key()},native.headers),method})).status).toBe(403);
    expect(sends(ctx)).toHaveLength(1);
  });
  it('requires CSRF and the configured web origin, rejects bad/extra input before verification',async()=>{
    const {ctx,call,headers,put}=await fixture();
    expect((await call('/v1/settings/meta-key',{...post({key:key()},{...headers,'x-csrf-token':''}),method:'PUT'})).status).toBe(403);
    expect((await call('/v1/settings/meta-key',{...post({key:key()},{...headers,origin:'https://untrusted.example'}),method:'PUT'})).status).toBe(403);
    for(const bad of [{key:'short'},{key:key()+'\r\n'},{key:key(),userId:'other'},{key:'x'.repeat(513)}])expect((await put(bad)).status).toBe(422);
    expect(sends(ctx)).toHaveLength(0);
  });
  it.each([401,403,429,500])('does not save/retry rejected status %s or discard the old key',async status=>{
    const {ctx,put}=await fixture();await put();const before=ctx.db.rows('SELECT ciphertext FROM user_meta_keys');
    ctx.net.on('POST',url,()=>json({secret:key(2)},status));
    const response=await put({key:key(2)});expect(response.status).toBe(status===401||status===403?422:502);
    expect(await response.text()).not.toContain(key(2));expect(sends(ctx)).toHaveLength(2);
    expect(ctx.db.rows('SELECT ciphertext FROM user_meta_keys')).toEqual(before);
  });
  it('isolates status and delete by session user and cascades account deletion',async()=>{
    const {ctx,web,call,headers,put}=await fixture();await put();
    const other=await signIn(ctx,'web',{...ghUser,id:4243,login:'other'});
    const otherHeaders={...other.headers,origin:'http://localhost:8081','x-csrf-token':other.csrf??''};
    expect(await (await call('/v1/settings/meta-key',{headers:otherHeaders})).json()).toEqual({configured:false});
    expect((await call('/v1/settings/meta-key',{method:'DELETE',headers:otherHeaders})).status).toBe(204);
    expect(await metaKeyStatus(ctx.env,web.userId)).toEqual({configured:true});
    expect((await call('/v1/settings/meta-key',{method:'DELETE',headers})).status).toBe(204);
    expect(await metaKeyStatus(ctx.env,web.userId)).toEqual({configured:false});await put();
    ctx.net.on('DELETE','https://api.github.com/applications/',()=>new Response(null,{status:204}));
    expect((await call('/v1/account',{method:'DELETE',headers})).status).toBe(204);
    expect(ctx.db.rows('SELECT * FROM user_meta_keys')).toEqual([]);
  });
  it('keeps demo fixture status false and all credential writes forbidden',async()=>{
    const ctx=testContext();const headers=await demoHeaders(ctx);const call=appFor(ctx);
    expect(await (await call('/v1/settings/meta-key',{headers})).json()).toEqual({configured:false});
    for(const method of ['PUT','DELETE'])expect((await call('/v1/settings/meta-key',{...post({key:key()},headers),method})).status).toBe(403);
    expect(sends(ctx)).toHaveLength(0);
  });
  it('keeps normal session rate limits on key verification',async()=>{
    const {ctx,put}=await fixture();ctx.env.SESSION_RATE_LIMITER=fakeLimiter(0);
    expect((await put()).status).toBe(429);expect(sends(ctx)).toHaveLength(0);
  });
});

describe('user-key AI routing and budgets',()=>{
  it.each(['summary','risk'] as const)('uses the user key for Meta %s, bypasses global budget, retains user cap',async task=>{
    const {ctx,web,put}=await fixture();await put();
    ctx.env.MODEL_ROUTE_RISK='meta:muse-spark-1.2';
    await createDbConsentStore(ctx.env.DB).write(web.userId,true);
    const usage=createDbUsageStore(ctx.env.DB);await usage.reserve('global',1);
    const transport=mockTransport(async()=>({text:JSON.stringify(task==='summary'?summary:risk)}));
    const deps={db:ctx.env.DB,transport,prSource:source,limits:{free:1,pro:200,global:1}};
    const analyze=task==='summary'?summarizePr:assessPrRisk;
    await analyze(deps,record(web.userId),ref,ctx.env);
    expect(transport.calls).toHaveLength(1);expect(transport.calls[0]?.apiKey).toBe(key());
    expect((await usage.check('global',1)).remaining).toBe(0);
    expect(ctx.db.rows<{used:number}>('SELECT used FROM ai_usage_daily WHERE scope=?','global')).toEqual([{used:1}]);
    // Over the user cap: summary is refused; risk falls back to its rule-based result. Neither calls the model.
    if(task==='summary')await expect(analyze(deps,record(web.userId),ref,ctx.env)).rejects.toMatchObject({code:'rate_limited'});
    else expect((await analyze(deps,record(web.userId),{...ref,number:ref.number+1},ctx.env)).body).toMatchObject({assessedBy:'rules'});
    expect(transport.calls).toHaveLength(1);
  });
  it('does not bypass the global budget for Workers AI, or for users without a key',async()=>{
    const {ctx,web,put}=await fixture();await put();await createDbConsentStore(ctx.env.DB).write(web.userId,true);
    await createDbUsageStore(ctx.env.DB).reserve('global',1);
    const ai=fakeAi();const transport=mockTransport();const deps={db:ctx.env.DB,transport,ai,prSource:source,limits:{free:30,pro:200,global:1}};
    expect((await assessPrRisk(deps,record(web.userId),ref,ctx.env)).body).toMatchObject({assessedBy:'rules'});
    expect(ai.runs).toHaveLength(0);
    await ctx.env.DB.prepare('DELETE FROM user_meta_keys').run();
    await expect(summarizePr(deps,record(web.userId),ref,ctx.env)).rejects.toMatchObject({code:'rate_limited'});
    expect(transport.calls).toHaveLength(0);
  });
  it('still requires consent and never falls back to the app key on an upstream failure',async()=>{
    const {ctx,web,put}=await fixture();await put();
    const transport=mockTransport(async()=>{throw new Error('Rejected');});const deps={db:ctx.env.DB,transport,prSource:source,limits:{free:30,pro:200,global:1}};
    await expect(summarizePr(deps,record(web.userId),ref,ctx.env)).rejects.toMatchObject({code:'consent_required'});expect(transport.calls).toHaveLength(0);
    await createDbConsentStore(ctx.env.DB).write(web.userId,true);
    await expect(summarizePr(deps,record(web.userId),ref,ctx.env)).rejects.toMatchObject({code:'upstream_unavailable'});
    expect(transport.calls).toHaveLength(1);expect(transport.calls[0]?.apiKey).toBe(key());
    expect((await createDbUsageStore(ctx.env.DB).check(web.userId,30)).remaining).toBe(30);
  });
  it('binds ciphertext to its owner and supports encryption-key rotation',async()=>{
    const {ctx,web,put}=await fixture();await put();
    const previous=ctx.env.TOKEN_ENCRYPTION_KEY;
    if(!previous)throw new Error('Missing fixture encryption key');
    const next='v2:'+Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
    const rotated={...ctx.env,TOKEN_ENCRYPTION_KEY:next,TOKEN_ENCRYPTION_KEY_PREVIOUS:previous};
    expect((await userModelContext(rotated,web.userId,'summary')).env.MODEL_API_KEY).toBe(key());
    await saveMetaKey(rotated,web.userId,key(2),ctx.time.now());
    expect(ctx.db.rows('SELECT key_version FROM user_meta_keys')).toEqual([{key_version:'v2'}]);
    const other=await signIn(ctx,'ios',{...ghUser,id:4243,login:'other'});
    await ctx.env.DB.prepare('INSERT INTO user_meta_keys SELECT ?,key_version,ciphertext,verified_at FROM user_meta_keys WHERE user_id=?').bind(other.userId,web.userId).run();
    await expect(userModelContext(rotated,other.userId,'summary')).rejects.toMatchObject({code:'upstream_unavailable'});
    expect(ctx.env.MODEL_API_KEY).not.toBe(key(2));
  });
  it('removes the key for new requests while an outstanding request keeps its own request-local copy',async()=>{
    const {ctx,web,call,headers,put}=await fixture();await put();await createDbConsentStore(ctx.env.DB).write(web.userId,true);
    const outstanding=await userModelContext(ctx.env,web.userId,'summary');
    expect(outstanding.ownsMetaKey).toBe(true);
    expect((await call('/v1/settings/meta-key',{method:'DELETE',headers})).status).toBe(204);
    expect(await metaKeyStatus(ctx.env,web.userId)).toEqual({configured:false});
    // The request that already started finishes with its own copy; the Worker binding is never mutated.
    expect(outstanding.env.MODEL_API_KEY).toBe(key());expect(ctx.env.MODEL_API_KEY).not.toBe(key());
    // The next request sees no saved key, so it uses the shared key under the shared budget.
    expect((await userModelContext(ctx.env,web.userId,'summary')).ownsMetaKey).toBe(false);
    await createDbUsageStore(ctx.env.DB).reserve('global',1);
    const transport=mockTransport();
    await expect(summarizePr({db:ctx.env.DB,transport,prSource:source,limits:{free:30,pro:200,global:1}},record(web.userId),ref,ctx.env)).rejects.toMatchObject({code:'rate_limited'});
    expect(transport.calls).toHaveLength(0);
  });
});
