import { describe, expect, it, vi } from 'vitest';
import { FeatureFlags } from '@mergemate/contracts';
import { appFor, post, signIn } from './sign-in';
import { fakeLimiter, testContext } from './helpers';

describe('public feature flags',()=>{
  it('serves default-off booleans anonymously with a 60-second cache and security headers',async()=>{
    const ctx=testContext();const get=vi.spyOn(ctx.env.POSTS as KVNamespace,'get');const prepare=vi.spyOn(ctx.db,'prepare');
    const response=await appFor(ctx)('/v1/flags');
    expect(response.status).toBe(200);expect(await response.json()).toEqual({voice_readout:false,voice_notes:false});
    expect(response.headers.get('cache-control')).toBe('public, max-age=60');
    expect(response.headers.get('strict-transport-security')).toContain('max-age=');expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(get).toHaveBeenCalledWith('flags:v1',{cacheTtl:60});expect(prepare).not.toHaveBeenCalled();
  });
  it('reads the admin publication shape and never returns unknown/private fields',async()=>{
    const ctx=testContext();ctx.kv.set('flags:v1',JSON.stringify({voice_readout:true,voice_notes:false,private_key:'not-public',future_flag:true}));
    const response=await appFor(ctx)('/v1/flags');const body=await response.json();
    expect(body).toEqual({voice_readout:true,voice_notes:false});expect(FeatureFlags.safeParse(body).success).toBe(true);
  });
  it.each([
    '{}','null','[]','true','"string"','{malformed',
    JSON.stringify({voice_readout:'true',voice_notes:1}),
    JSON.stringify({voice_readout:false,voice_notes:null}),
    'x'.repeat(2049),
  ])('keeps unknown, missing, non-boolean or malformed switches off: %s',async raw=>{
    const ctx=testContext();ctx.kv.set('flags:v1',raw);
    expect(await (await appFor(ctx)('/v1/flags')).json()).toEqual({voice_readout:false,voice_notes:false});
  });
  it('retains a valid flag when the other flag is missing or malformed',async()=>{
    const ctx=testContext();ctx.kv.set('flags:v1',JSON.stringify({voice_readout:true,voice_notes:'yes'}));
    expect(await (await appFor(ctx)('/v1/flags')).json()).toEqual({voice_readout:true,voice_notes:false});
  });
  it('fails closed if KV is unavailable or the binding is missing',async()=>{
    const ctx=testContext();const get=vi.spyOn(ctx.env.POSTS as KVNamespace,'get').mockRejectedValue(new Error('fixture unavailable'));
    expect(await (await appFor(ctx)('/v1/flags')).json()).toEqual({voice_readout:false,voice_notes:false});get.mockRestore();
    delete ctx.env.POSTS;
    expect(await (await appFor(ctx)('/v1/flags')).json()).toEqual({voice_readout:false,voice_notes:false});
  });
  it('never varies its public body by cookie or bearer identity and preserves auth elsewhere',async()=>{
    const ctx=testContext();ctx.kv.set('flags:v1',JSON.stringify({voice_readout:true,voice_notes:true}));
    const call=appFor(ctx);const native=await signIn(ctx);
    for(const headers of [{},{authorization:'Bearer invalid'},native.headers,{cookie:'__Host-mm_session=invalid'}]){
      const response=await call('/v1/flags',{headers});expect(response.status).toBe(200);
      expect(await response.json()).toEqual({voice_readout:true,voice_notes:true});expect(response.headers.has('set-cookie')).toBe(false);
    }
    expect((await call('/v1/settings')).status).toBe(401);expect((await call('/v1/flags/other')).status).toBe(401);
    expect((await call('/v1/flags',post({voice_readout:false},native.headers))).status).toBe(404);
    expect(ctx.kv.get('flags:v1')).toBe(JSON.stringify({voice_readout:true,voice_notes:true}));
  });
  it('keeps public IP rate limiting and makes errors non-cacheable',async()=>{
    const ctx=testContext({IP_RATE_LIMITER:fakeLimiter(1)});const call=appFor(ctx);
    expect((await call('/v1/flags')).status).toBe(200);const limited=await call('/v1/flags');
    expect(limited.status).toBe(429);expect(limited.headers.get('cache-control')).toBe('no-store');
  });
  it('keeps the contract strict with missing flags off',()=>{
    expect(FeatureFlags.parse({})).toEqual({voice_readout:false,voice_notes:false});
    expect(FeatureFlags.safeParse({voice_readout:'true'}).success).toBe(false);
    expect(FeatureFlags.safeParse({future_flag:true}).success).toBe(false);
  });
});
