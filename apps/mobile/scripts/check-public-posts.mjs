import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../dist');
const proof=process.env.MM_POST_PROOF_DIR??'/private/tmp/mergemate-public-posts';await mkdir(proof,{recursive:true});
const server=createServer(async(req,res)=>{
  try {
    const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
    if(!path.startsWith(root+sep)&&path!==root){res.writeHead(404).end();return;}
    let body;let file=path;try{body=await readFile(path);}catch{file=resolve(root,'index.html');body=await readFile(file);}
    const type={'.js':'application/javascript','.css':'text/css','.png':'image/png','.ttf':'font/ttf','.woff2':'font/woff2'}[extname(file)]??'text/html';
    res.writeHead(200,{'content-type':type});res.end(body);
  }catch{res.writeHead(500).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;let browser;
const summary=(type,slug=type+'-post')=>({slug,type,title:type==='news'?'A published announcement':'A published release',excerpt:'Preview only — read the full published update.',publishedAt:'2026-10-28T12:00:00Z'});
try {
  browser=await chromium.launch({headless:true});
  for(const width of [393,1440]) {
    const page=await browser.newPage({viewport:{width,height:900}});let failDetail=true;const publicRequests=[];const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://api-dev.mergemate.dev/**',async route=>{
      const req=route.request();const url=new URL(req.url());const headers={'access-control-allow-origin':base,'access-control-allow-credentials':'true'};
      const reply=(status,json)=>route.fulfill({status,headers,contentType:'application/json',body:JSON.stringify(json)});
      if(url.pathname.startsWith('/v1/public/')){publicRequests.push(req.headers());}
      if(url.pathname==='/v1/public/posts'){
        const type=url.searchParams.get('type');const first=summary(type);
        return reply(200,{items:url.searchParams.get('cursor')?[first,{...first,slug:'older-news',title:'An earlier announcement'}]:[first],nextCursor:type==='news'&&!url.searchParams.get('cursor')?'50':null});
      }
      if(url.pathname==='/v1/public/posts/missing')return reply(404,{error:{code:'not_found',message:'Not found.',requestId:'fixture'}});
      if(url.pathname.startsWith('/v1/public/posts/')){
        if(failDetail){failDetail=false;return reply(503,{error:{code:'upstream_unavailable',message:'Unavailable.',requestId:'fixture'}});}
        const slug=url.pathname.split('/').pop();const type=slug.startsWith('news')?'news':'changelog';
        return reply(200,{...summary(type,slug),body:slug==='unsafe-post'?'Untrusted <img src=bad onerror=window.__postPwned=1> [unsafe](javascript:alert(1))':'Full published body\\nSecond line — 日本語\\n\\nSafe text remains readable.',draft_note:'PRIVATE_DRAFT_FIXTURE',actor_email:'PRIVATE_STAFF_FIXTURE'});
      }
      return reply(401,{error:{code:'unauthorized',message:'Sign in.',requestId:'fixture'}});
    });
    await page.goto(base+'/news');await page.getByRole('button',{name:'Read full post: A published announcement',exact:true}).waitFor();
    assert.equal(await page.getByText('Full published body',{exact:true}).count(),0);
    await page.getByRole('button',{name:'Load more updates',exact:true}).click();await page.getByText('An earlier announcement',{exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Read full post: A published announcement',exact:true}).count(),1);
    await page.getByRole('button',{name:'Read full post: A published announcement',exact:true}).click();
    await page.getByText("Couldn't load this post",{exact:true}).waitFor();await page.getByRole('button',{name:'Try Again',exact:true}).click();
    await page.getByText(/Full published body/).waitFor();assert.match(await page.getByText(/Full published body/).textContent(),/Second line — 日本語/);
    await page.screenshot({path:`${proof}/news-full-${width}.png`,fullPage:true});
    await page.reload();await page.getByText(/Full published body/).waitFor();
    await page.goto(base+'/changelog');await page.getByRole('button',{name:'Read full post: A published release',exact:true}).click();await page.getByText(/Full published body/).waitFor();
    await page.screenshot({path:`${proof}/changelog-full-${width}.png`,fullPage:true});
    await page.goto(base+'/posts/unsafe-post');await page.getByText(/Untrusted/).waitFor();
    assert.equal(await page.locator('img[src=bad]').count(),0);assert.equal(await page.evaluate(()=>window.__postPwned),undefined);
    await page.goto(base+'/posts/missing');await page.getByText('Post unavailable',{exact:true}).waitFor();
    assert.equal(await page.getByText('PRIVATE_DRAFT_FIXTURE',{exact:true}).count(),0);assert.equal(await page.getByText('PRIVATE_STAFF_FIXTURE',{exact:true}).count(),0);
    assert.equal(await page.locator('a[href^="javascript:"]').count(),0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert(publicRequests.length>0);assert(publicRequests.every(h=>!h.authorization&&!h.cookie));assert.deepEqual(errors,[]);await page.close();
  }
  console.log('PASS: published full News/Changelog bodies, pagination/dedup, error retry, direct URL/refresh, missing posts, Unicode/newlines and no private request headers at393/1440. Screenshots: '+proof);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
