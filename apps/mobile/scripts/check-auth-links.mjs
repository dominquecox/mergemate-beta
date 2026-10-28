import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../dist');
const proof=process.env.MM_AUTH_PROOF_DIR ?? '/private/tmp/mergemate-auth-links';
await mkdir(proof,{recursive:true});
const server=createServer(async(req,res)=>{
  try {
    const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
    if(!path.startsWith(root+sep)&&path!==root){res.writeHead(404).end();return;}
    let body;let file=path;
    try{body=await readFile(path);}catch{file=resolve(root,'index.html');body=await readFile(file);}
    const type={'.js':'application/javascript','.css':'text/css','.png':'image/png','.ttf':'font/ttf','.woff2':'font/woff2'}[extname(file)]??'text/html';
    res.writeHead(200,{'content-type':type});res.end(body);
  }catch{res.writeHead(500).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port;
let browser;
try {
  browser=await chromium.launch({headless:true});
  for(const width of [393,1440]){
    const page=await browser.newPage({viewport:{width,height:900},userAgent:'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36'});
    const exchanges=[];const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://api-dev.mergemate.dev/**',route=>{
      if(route.request().url().includes('/auth/github/callback'))exchanges.push(route.request().method());
      return route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({error:{code:'unauthorized',message:'Sign in again.',requestId:'local-fixture'}})});
    });
    for(const query of ['code=fixture&state=missing','code=one&code=two&state=missing']){
      await page.goto(`http://127.0.0.1:${port}/auth/callback?${query}`);
      await page.waitForURL('**/sign-in',{timeout:15000});
      await page.getByText(/That sign-in link/).first().waitFor();
      assert.equal(await page.getByText('Open MergeMate App',{exact:true}).count(),0);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
      await page.screenshot({path:`${proof}/callback-${width}-${query.includes('two')?'duplicate':'expired'}.png`,fullPage:true});
    }
    assert.deepEqual(exchanges,[]);assert.deepEqual(errors,[]);await page.close();
  }
  console.log('PASS: expired/duplicate callbacks fail safely at 393/1440; no code exchange, private-scheme fallback or page errors. Screenshots: '+proof);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
