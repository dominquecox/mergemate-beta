import { describe, expect, it, vi } from 'vitest';
import { FeatureFlags } from '@mergemate/contracts';
import { appFor, post, signIn } from './sign-in';
import { fakeLimiter, testContext } from './helpers';

describe('public feature flags',()=>{
  it('serves default-off booleans anonymously with a 60-second cache and security headers',async()=>{
    const ctx=testContext();const get=vi.spyOn(ctx.env.POSTS as KVNamespace,'get');const prepare=vi.spyOn(ctx.db,'prepare');
    const response=await appFor(ctx)('/v1/flags');
    expect(response.status).toBe(200);expect(await response.json()).toEqual({voice_readout:false,voice_notes:false,highlight:false});
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('strict-transport-security')).toContain('max-age=');expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(get).toHaveBeenCalledWith('flags:v1',{cacheTtl:60});expect(prepare).not.toHaveBeenCalled();
  });
  it('reads the admin publication shape and never returns unknown/private fields',async()=>{
    const ctx=testContext();ctx.kv.set('flags:v1',JSON.stringify({voice_readout:true,voice_notes:false,private_key:'not-public',future_flag:true}));
    const response=await appFor(ctx)('/v1/flags');const body=await response.json();
    expect(body).toEqual({voice_readout:true,voice_notes:false,highlight:false});expect(FeatureFlags.safeParse(body).success).toBe(true);
  });
  it.each([
    '{}','null','[]','true','"string"','{malformed',
    JSON.stringify({voice_readout:'true',voice_notes:1}),
    JSON.stringify({voice_readout:false,voice_notes:null}),
    'x'.repeat(2049),
  ])('keeps unknown, missing, non-boolean or malformed switches off: %s',async raw=>{
    const ctx=testContext();ctx.kv.set('flags:v1',raw);
    expect(await (await appFor(ctx)('/v1/flags')).json()).toEqual({voice_readout:false,voice_notes:false,highlight:false});
  });
  it('retains a valid flag when the other flag is missing or malformed',async()=>{
    const ctx=testContext();ctx.kv.set('flags:v1',JSON.stringify({voice_readout:true,voice_notes:'yes'}));
    expect(await (await appFor(ctx)('/v1/flags')).json()).toEqual({voice_readout:true,voice_notes:false,highlight:false});
  });
  it('fails closed if KV is unavailable or the binding is missing',async()=>{
    const ctx=testContext();const get=vi.spyOn(ctx.env.POSTS as KVNamespace,'get').mockRejectedValue(new Error('fixture unavailable'));
    expect(await (await appFor(ctx)('/v1/flags')).json()).toEqual({voice_readout:false,voice_notes:false,highlight:false});get.mockRestore();
    delete ctx.env.POSTS;
    expect(await (await appFor(ctx)('/v1/flags')).json()).toEqual({voice_readout:false,voice_notes:false,highlight:false});
  });
  it('never varies its public body by cookie or bearer identity and preserves auth elsewhere',async()=>{
    const ctx=testContext();ctx.kv.set('flags:v1',JSON.stringify({voice_readout:true,voice_notes:true,highlight:false}));
    const call=appFor(ctx);const native=await signIn(ctx);
    for(const headers of [{},{authorization:'Bearer invalid'},native.headers,{cookie:'__Host-mm_session=invalid'}]){
      const response=await call('/v1/flags',{headers});expect(response.status).toBe(200);
      expect(await response.json()).toEqual({voice_readout:true,voice_notes:true,highlight:false});expect(response.headers.has('set-cookie')).toBe(false);
    }
    expect((await call('/v1/settings')).status).toBe(401);expect((await call('/v1/flags/other')).status).toBe(401);
    expect((await call('/v1/flags',post({voice_readout:false},native.headers))).status).toBe(404);
    expect(ctx.kv.get('flags:v1')).toBe(JSON.stringify({voice_readout:true,voice_notes:true,highlight:false}));
  });
  it('keeps public IP rate limiting and makes errors non-cacheable',async()=>{
    const ctx=testContext({IP_RATE_LIMITER:fakeLimiter(1)});const call=appFor(ctx);
    expect((await call('/v1/flags')).status).toBe(200);const limited=await call('/v1/flags');
    expect(limited.status).toBe(429);expect(limited.headers.get('cache-control')).toBe('no-store');
  });
  it('keeps the contract strict with missing flags off',()=>{
    expect(FeatureFlags.parse({})).toEqual({voice_readout:false,voice_notes:false,highlight:false});
    expect(FeatureFlags.safeParse({voice_readout:'true'}).success).toBe(false);
    expect(FeatureFlags.safeParse({future_flag:true}).success).toBe(false);
  });
});
it('publishes brain only when it is literally true, so older app builds still parse the document',async()=>{
  for(const [brain,expected] of [[true,{brain:true}],[false,{}],['true',{}],[1,{}],[undefined,{}]] as const){
    const ctx=testContext();ctx.kv.set('flags:v1',JSON.stringify({voice_readout:true,voice_notes:true,highlight:true,brain}));
    const body=await (await appFor(ctx)('/v1/flags')).json();
    expect(body).toEqual({voice_readout:true,voice_notes:true,highlight:true,...expected});expect(FeatureFlags.safeParse(body).success).toBe(true);
  }
});
it('publishes only a literal highlight boolean and ignores unknown fields',async()=>{
  for(const [highlight,expected] of [[true,true],[false,false],['true',false],[1,false],[null,false],[undefined,false]]){
    const ctx=testContext();ctx.kv.set('flags:v1',JSON.stringify({voice_readout:true,voice_notes:true,highlight,private_token:'fixture'}));
    expect(await (await appFor(ctx)('/v1/flags')).json()).toEqual({voice_readout:true,voice_notes:true,highlight:expected});
  }
});
it('rejects screenshot uploads before consent/provider work when highlight is off or unavailable',async()=>{
  for(const raw of [null,'{}','{"highlight":false}','{"highlight":"true"}','not-json']){
    const ctx=testContext();const {headers}=await signIn(ctx);if(raw!==null)ctx.kv.set('flags:v1',raw);
    const calls=ctx.net.calls.length;
    const response=await appFor(ctx)('/v1/highlight',{method:'POST',headers,body:new FormData()});
    expect(response.status).toBe(404);expect(ctx.net.calls).toHaveLength(calls);
    expect(ctx.db.rows('SELECT * FROM ai_usage_daily')).toHaveLength(0);
  }
});
