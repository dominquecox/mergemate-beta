import {describe,it,expect} from 'vitest';
import {DependencyContext} from '@mergemate/contracts';
import {testContext,json} from './helpers';
import {appFor,signIn} from './sign-in';
const sha='a'.repeat(40),root='https://api.github.com/repos/acme/app';
async function setup(){const ctx=testContext(),{headers}=await signIn(ctx,'ios');ctx.net.on('GET',root+'/pulls/7',()=>json({head:{sha,repo:{full_name:'acme/app'}}}));ctx.net.on('GET',root+'/pulls/7/files?per_page=100&page=1',()=>json([{filename:'apps/mobile/src/view.ts'}]));let reads=0;
 const content=(pkg:object)=>new Response(JSON.stringify({encoding:'base64',size:JSON.stringify(pkg).length,content:btoa(JSON.stringify(pkg))}),{status:200,headers:{'content-type':'application/json','content-encoding':'gzip'}});
 ctx.net.on('GET',root+'/contents/package.json?ref='+sha,()=>{reads++;return content({name:'suite',workspaces:['apps/*'],dependencies:{rootlib:'private-registry-value'},registryAuth:'credential-not-returned'});});
 ctx.net.on('GET',root+'/contents/apps/mobile/package.json?ref='+sha,()=>{reads++;return content({name:'mobile',dependencies:{react:'private-version'},devDependencies:{typescript:'private-version'}});});return {call:appFor(ctx),headers,get reads(){return reads;}};
}
describe('manifest-backed guardrail context',()=>{
 it('returns revision-scoped dependency names, never versions or arbitrary manifest fields',async()=>{const s=await setup(),res=await s.call('/v1/prs/acme/app/7/dependencies?headSha='+sha,{headers:s.headers});expect(res.status).toBe(200);expect(res.headers.get('cache-control')).toContain('no-store');const raw=await res.json(),body=DependencyContext.parse(raw);expect(body.manifests.find(m=>m.directory==='apps/mobile')?.names).toContain('react');expect(body.manifests[0]?.names).toContain('rootlib');expect(JSON.stringify(raw)).not.toContain('credential-not-returned');expect(JSON.stringify(raw)).not.toContain('private-version');expect(s.reads).toBe(2);});
 it('rejects a stale head and unauthenticated requests before reading manifests',async()=>{const s=await setup();expect((await s.call('/v1/prs/acme/app/7/dependencies?headSha='+('b'.repeat(40)),{headers:s.headers})).status).toBe(409);expect((await s.call('/v1/prs/acme/app/7/dependencies')).status).toBe(401);expect(s.reads).toBe(0);});
});
