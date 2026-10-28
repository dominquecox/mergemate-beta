import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import type { AdmissionNamespace } from '../src/rate-policy';
import { appFor } from './sign-in';
import { testContext } from './helpers';
it('fails closed with503/no-store/CORS for missing, failing or invalid admission',async()=>{
  const failures:AdmissionNamespace[]=[
    {getByName:()=>({admit:async()=>{throw new Error('private-credential-fixture');}})},
    {getByName:()=>({admit:async()=>({success:true,retryAfter:60})})},
    {getByName:()=>({admit:async()=>({success:false,retryAfter:0})})},
  ];
  for(const authority of failures){
    const ctx=testContext({RATE_ADMISSION:authority});
    const response=await appFor(ctx)('/v1/health',{headers:{origin:'https://dev.mergemate.dev'}});
    expect(response.status).toBe(503);expect(response.headers.get('cache-control')).toBe('no-store');expect(response.headers.get('retry-after')).toBe('1');
    expect(response.headers.get('access-control-allow-origin')).toBe('https://dev.mergemate.dev');
    expect(await response.text()).not.toContain('private-credential-fixture');expect(ctx.net.calls).toHaveLength(0);
  }
  const ctx=testContext();delete ctx.env.RATE_ADMISSION;
  const response=await appFor(ctx)('/v1/flags',{method:'OPTIONS',headers:{origin:'https://dev.mergemate.dev','access-control-request-method':'GET'}});
  expect(response.status).toBe(503);expect(response.headers.get('access-control-allow-origin')).toBe('https://dev.mergemate.dev');
});
it('times out unavailable authoritative RPC instead of running the handler',async()=>{
  vi.useFakeTimers();
  try {
    let entered!:()=>void;const started=new Promise<void>(resolve=>{entered=resolve;});
    const ctx=testContext({RATE_ADMISSION:{getByName:()=>({admit:()=>{entered();return new Promise(()=>{});}})}});
    const pending=appFor(ctx)('/v1/health');await started;await vi.advanceTimersByTimeAsync(2001);
    expect((await pending).status).toBe(503);expect(ctx.net.calls).toHaveLength(0);
  }finally{vi.useRealTimers();}
});
it('uses opaque deterministic environment/scope identities rather than raw IPs',async()=>{
  const names:string[]=[];const authority:AdmissionNamespace={getByName:name=>{names.push(name);return{admit:async()=>({success:true,retryAfter:0})};}};
  for(const APP_ENV of ['development','production']){
    const ctx=testContext({APP_ENV,RATE_ADMISSION:authority});
    expect((await appFor(ctx)('/v1/health',{headers:{'cf-connecting-ip':'203.0.113.25'}})).status).toBe(200);
  }
  expect(names).toHaveLength(2);expect(names.every(name=>/^ip:[a-f0-9]{64}$/.test(name))).toBe(true);expect(names[0]).not.toBe(names[1]);
  expect(names.join('')).not.toContain('203.0.113.25');
});
it('pins cache disablement and the SQLite namespace in every deploy environment',()=>{
  const config=readFileSync(new URL('../wrangler.toml',import.meta.url),'utf8');
  for(const table of ['cache','env.dev.cache','env.production.cache'])expect(config).toContain(`[${table}]\nenabled = false`);
  for(const prefix of ['','env.dev.','env.production.'])expect(config).toContain(`[[${prefix}durable_objects.bindings]]\nname = "RATE_ADMISSION"\nclass_name = "RateAdmission"`);
  expect(config).toContain('new_sqlite_classes = ["RateAdmission"]');expect(config).not.toContain('[[ratelimits]]');
});
