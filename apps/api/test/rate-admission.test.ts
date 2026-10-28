import { z } from "zod";
import { afterAll, beforeAll, expect, it } from 'vitest';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Admission, AdmissionScope } from '../src/rate-policy';
let mf:Miniflare;let script:string;let storage:string;const now=Date.now();
const runtime=()=>new Miniflare({...convertV4MiniflareOptions({name:'rate-admission-fixture',modules:true,script,compatibilityDate:'2026-10-26',durableObjects:{RATE_ADMISSION:{className:'TestRateAdmission',useSQLite:true}},kvNamespaces:['POSTS'],bindings:{APP_ENV:'development',WEB_ORIGIN:'https://dev.mergemate.dev'}}),resourcePersistencePath:storage});
function call(name:string,scope:AdmissionScope):Promise<Admission>;
function call(name:string,scope:AdmissionScope,action:'inspect'):Promise<{count:number}>;
function call(name:string,scope:AdmissionScope,action:'clock'|'cleanup',time?:number):Promise<{ok:boolean}>;
async function call(name:string,scope:AdmissionScope,action?:string,time?:number):Promise<Admission|{count:number}|{ok:boolean}> {
  const response=await mf.dispatchFetch('https://local.test/admit',{method:'POST',body:JSON.stringify({name,scope,action,now:time})});
  if(response.status!==200)throw new Error(`Local DO fixture failed: ${response.status}`);
  const body:unknown=await response.json();
  if(action==='inspect')return z.object({count:z.number().int().nonnegative()}).parse(body);
  if(action)return z.object({ok:z.boolean()}).parse(body);
  return z.object({success:z.boolean(),retryAfter:z.number().int().nonnegative()}).parse(body);
}
beforeAll(async()=>{
  storage=await mkdtemp(join(tmpdir(),'mergemate-rate-'));
  const compiled=await build({entryPoints:[new URL('./rate-admission-worker.ts',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'browser',external:['cloudflare:workers']});
  const file=compiled.outputFiles[0];if(!file)throw new Error("Local runtime bundle was empty");
  script=file.text;mf=runtime();
});
afterAll(async()=>{await mf?.dispose();if(storage)await rm(storage,{recursive:true,force:true});});
it('admits exactly the allowance for concurrent callers sharing each real SQLite object',async()=>{
  for(const [scope,allowance] of [['ip',60],['session',300],['support',5]] as const){
    const name='shared-'+scope;await call(name,scope,'clock',now);
    const replies=await Promise.all(Array.from({length:allowance+112},()=>call(name,scope)));
    expect(replies.filter(r=>r.success)).toHaveLength(allowance);
    expect(replies.filter(r=>!r.success)).toHaveLength(112);expect(replies.filter(r=>!r.success).every(r=>r.retryAfter===60)).toBe(true);
    expect((await call(name,scope,'inspect')).count).toBe(allowance);
  }
},20_000);
it('uses a rolling window and accurate retry, including the exact boundary and clock rollback',async()=>{
  const name='rolling-support';await call(name,'support','clock',now);
  for(let n=0;n<3;n++)expect((await call(name,'support')).success).toBe(true);
  await call(name,'support','clock',now+30_000);
  for(let n=0;n<2;n++)expect((await call(name,'support')).success).toBe(true);
  expect(await call(name,'support')).toMatchObject({success:false,retryAfter:30});
  await call(name,'support','clock',now+59_999);expect(await call(name,'support')).toMatchObject({success:false,retryAfter:1});
  await call(name,'support','clock',now+60_000);
  for(let n=0;n<3;n++)expect((await call(name,'support')).success).toBe(true);
  expect(await call(name,'support')).toMatchObject({success:false,retryAfter:30});
  await call(name,'support','clock',now+45_000);expect((await call(name,'support')).success).toBe(false);
});
it('retains quota across runtime restart and cleans expired records through the alarm',async()=>{
  const name='persist-support';await call(name,'support','clock',now);
  for(let n=0;n<5;n++)expect((await call(name,'support')).success).toBe(true);
  await mf.dispose();mf=runtime();await call(name,'support','clock',now);
  expect(await call(name,'support')).toMatchObject({success:false,retryAfter:60});
  expect((await call(name,'support','inspect')).count).toBe(5);
  await call(name,'support','clock',now+60_000);await call(name,'support','cleanup');
  expect((await call(name,'support','inspect')).count).toBe(0);expect((await call(name,'support')).success).toBe(true);
},20_000);
it('separates different identity objects',async()=>{
  for(const name of ['identity-a','identity-b']){
    await call(name,'support','clock',now);for(let n=0;n<5;n++)expect((await call(name,'support')).success).toBe(true);
    expect((await call(name,'support')).success).toBe(false);
  }
});
it('admits warm public GETs and OPTIONS once each through the real API and SQLite coordinator',async()=>{
  const init={headers:{origin:'https://dev.mergemate.dev'}};
  for(const path of ['/v1/health','/v1/flags']){
    const preflight=await mf.dispatchFetch('https://local.test'+path,{method:'OPTIONS',headers:{...init.headers,'access-control-request-method':'GET'}});
    expect(preflight.status).toBe(204);
  }
  const ids=new Set<string>();
  for(let n=0;n<58;n++){
    const path=n%2?'/v1/health':'/v1/flags';const response=await mf.dispatchFetch('https://local.test'+path,init);
    expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');
    ids.add(response.headers.get('x-request-id')??'');
  }
  expect(ids.size).toBe(58);
  const blocked=await mf.dispatchFetch('https://local.test/v1/flags',init);
  expect(blocked.status).toBe(429);expect(blocked.headers.get('access-control-allow-origin')).toBe('https://dev.mergemate.dev');
  expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThanOrEqual(1);
  expect(Number(blocked.headers.get('retry-after'))).toBeLessThanOrEqual(60);
},20_000);
it('cannot raise an existing object allowance by changing its scope',async()=>{
  const name='scope-pinned';await call(name,'support','clock',now);
  for(let n=0;n<5;n++)expect((await call(name,'support')).success).toBe(true);
  await expect(call(name,'session')).rejects.toThrow('Local DO fixture failed');
  expect((await call(name,'support','inspect')).count).toBe(5);
});
