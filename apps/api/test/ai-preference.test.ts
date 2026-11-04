import { describe, expect, it, vi } from 'vitest';
import { ErrorBody } from '@mergemate/contracts';
import { assessPrRisk, summarizePr } from '../src/routes/ai-engine';
import { defaultSettings } from '../src/lib/settings';
import { appFor, post, signIn } from './sign-in';
import { testContext } from './helpers';
import { demoHeaders } from './demo-session';
import { putPrefs, setSummaries } from './ai-choices';

const ref={owner:'acme',repo:'api',number:7};
describe('AI summaries preference',()=>{
  it.each(['summary','risk'] as const)('blocks %s before consent, usage, cache, GitHub or providers',async(kind)=>{
    const ctx=testContext(); const session=await signIn(ctx); const call=appFor(ctx);
    expect((await setSummaries(call,session.headers,false)).status).toBe(200);
    const prepare=vi.spyOn(ctx.db,'prepare'); const before=ctx.net.calls.length;
    const response=await call(`/v1/prs/acme/api/7/${kind}`,post({},session.headers));
    expect(response.status).toBe(403);expect(ErrorBody.parse(await response.json()).error).toMatchObject({code:'forbidden',message:'AI summaries and risk are turned off in Settings.'});
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(prepare.mock.calls.map(([sql])=>sql).join('\n')).not.toMatch(/consent_grants|ai_usage_daily|ai_results_cache|user_meta_keys/);
    expect(ctx.net.calls).toHaveLength(before);
    // Re-enabling needs the consent gate first; it cannot be done around it.
    prepare.mockRestore();
    const early=await setSummaries(call,session.headers,true);
    expect(early.status).toBe(403);expect(ErrorBody.parse(await early.json()).error.code).toBe('consent_required');
    expect((await putPrefs(call,session.headers,{action:'grant',version:'2'})).status).toBe(200);
    expect((await setSummaries(call,session.headers,false)).status).toBe(200);
    expect((await setSummaries(call,session.headers,true)).status).toBe(200);
    // The generic settings save cannot turn it back off or on: it only changes through the AI choices.
    await call('/v1/settings',{...post({...defaultSettings(),aiSummaries:false},session.headers),method:'PUT'});
    expect(await (await call('/v1/settings',{headers:session.headers})).json()).toMatchObject({aiSummaries:true});
  });
  it('also enforces the preference for direct engine callers before cached results',async()=>{
    const ctx=testContext(); const {userId}=await signIn(ctx);
    await ctx.env.DB.prepare('INSERT INTO user_settings VALUES(?,?,?)').bind(userId,JSON.stringify({...defaultSettings(),aiSummaries:false}),ctx.time.now().toISOString()).run();
    const prSource=vi.fn();const complete=vi.fn();
    const session={userId,demo:false,tokenHash:'fixture',transport:'bearer' as const,csrfToken:null,expiresAt:'2099-01-01',userStatus:'active' as const};
    const deps={db:ctx.env.DB,prSource,transport:{complete},limits:{free:30,pro:200}};
    for(const analyze of [summarizePr,assessPrRisk])await expect(analyze(deps,session,ref,ctx.env)).rejects.toMatchObject({code:'forbidden'});
    expect(prSource).not.toHaveBeenCalled();expect(complete).not.toHaveBeenCalled();
  });
  it('keeps demo fixtures available without consulting user settings',async()=>{
    const ctx=testContext();const headers=await demoHeaders(ctx);
    for(const kind of ['summary','risk'])expect((await appFor(ctx)(`/v1/prs/acme/api/7/${kind}`,post({},headers))).status).toBe(200);
    expect(ctx.db.rows('SELECT * FROM ai_usage_daily')).toEqual([]);
  });
});
