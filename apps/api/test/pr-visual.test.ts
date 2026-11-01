import {staticSvg,normalizeVisualPreview} from '../src/images/visual-preview';
import {describe,it,expect} from 'vitest';
import {testContext,json} from './helpers';
import {appFor,signIn} from './sign-in';
import {fixtureImages,imagePng} from './image-fixtures';
import {toBase64} from '../src/routes/ai-engine-highlight';
const sha='a'.repeat(40),baseSha='b'.repeat(40),root='https://api.github.com/repos/acme/app';
async function setup(){const ctx=testContext({IMAGES:fixtureImages()});const {headers}=await signIn(ctx,'ios');let reads=0;
 ctx.net.on('GET',root+'/pulls/7',()=>json({head:{sha,repo:{full_name:'acme/app'}},base:{sha:baseSha,repo:{full_name:'acme/app'}}}));
 ctx.net.on('GET',root+'/pulls/7/files?per_page=100&page=1',()=>json([{filename:'new.png',previous_filename:'old.png',status:'renamed'}]));
 for(const [path,ref] of [['new.png',sha],['old.png',baseSha]])ctx.net.on('GET',`${root}/contents/${path}?ref=${ref}`,()=>{reads++;return json({encoding:'base64',size:imagePng().length,content:toBase64(imagePng(1,1,'private metadata'))});});
 return {call:appFor(ctx),headers,get reads(){return reads;}};
}
describe('authenticated revision-bound visual assets',()=>{
 it('normalizes before/after renamed assets and never returns tokens or metadata',async()=>{const s=await setup();for(const side of ['before','after']){const res=await s.call(`/v1/prs/acme/app/7/visual?path=new.png&side=${side}&headSha=${sha}`,{headers:s.headers});expect(res.status).toBe(200);expect(res.headers.get('cache-control')).toContain('no-store');const body=await res.json() as {dataUrl:string};expect(body.dataUrl).toMatch(/^data:image\/png;base64,/);expect(atob(body.dataUrl.split(',')[1]??'')).not.toContain('private metadata');}expect(s.reads).toBe(2);});
 it('refuses unrelated assets and changed heads before reading bytes',async()=>{const s=await setup();expect((await s.call(`/v1/prs/acme/app/7/visual?path=unrelated.png&side=after`,{headers:s.headers})).status).toBe(404);expect((await s.call(`/v1/prs/acme/app/7/visual?path=new.png&side=after&headSha=${baseSha}`,{headers:s.headers})).status).toBe(409);expect(s.reads).toBe(0);});
 it('requires an authenticated session',async()=>{const s=await setup();expect((await s.call('/v1/prs/acme/app/7/visual?path=new.png&side=after')).status).toBe(401);expect(s.reads).toBe(0);});
});

describe('SVG preview safety',()=>{
 it('rejects executable/external SVG and entities before decoding',()=>{for(const s of ['<svg><script>alert(1)</script></svg>','<svg><image href="https://example.com/a.png"/></svg>','<svg><rect style="fill:url(x)"/></svg>','<!DOCTYPE svg><svg/>','<svg onload="alert(1)"/>'])expect(()=>staticSvg(new TextEncoder().encode(s))).toThrow();});
 it('only returns rasterized PNG for a static shape',async()=>{const bytes=new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44"><rect width="44" height="44" fill="red"/></svg>');expect(staticSvg(bytes)).toContain('<rect');const png=await normalizeVisualPreview(fixtureImages(),bytes,'shape.svg');expect(png).toEqual(imagePng());});
});
