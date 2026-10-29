import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../dist');
const proof=process.env.MM_FLAGS_PROOF_DIR ?? '/private/tmp/mergemate-feature-flags';
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
try{
  browser=await chromium.launch({headless:true,channel:'chrome'});
  const base=`http://127.0.0.1:${port}`;
  for(const width of [393,1440])for(const mode of ['on','off','malformed','unavailable']){
    const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block'});
    const page=await context.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',error=>errors.push(error.message));let flagsCalls=0,analysisCalls=0;
    await page.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url());if(url.origin===base||url.protocol==='data:')return route.continue();
      if(url.origin!=='https://api-dev.mergemate.dev')return route.abort();
      const headers={'content-type':'application/json','access-control-allow-origin':base,'access-control-allow-credentials':'true','access-control-allow-headers':'content-type,x-csrf-token','access-control-allow-methods':'GET,POST,DELETE,OPTIONS'};
      const reply=(status,body)=>route.fulfill({status,headers,body:JSON.stringify(body)});
      if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
      const path=url.pathname.replace('/v1','');
      if(path==='/flags'){flagsCalls++;assert.equal(request.headers().authorization,undefined);assert.equal(request.headers().cookie,undefined);return reply(mode==='unavailable'?503:200,mode==='on'?{highlight:true,voice_readout:false,voice_notes:false}:mode==='malformed'?{highlight:'true'}:mode==='unavailable'?{error:{code:'upstream_unavailable',message:'Unavailable',requestId:'fixture'}}:{highlight:false});}
      if(path==='/inbox/preference')return reply(200,{filter:'all'});
   if(path==='/inbox/undo')return reply(200,null);
   if(path==='/me')return reply(200,{id:'fixture-user',login:'fixture',name:'Fixture',avatarUrl:base+'/favicon.ico',demo:false});
      if(path==='/auth/refresh')return reply(200,{session:{expiresAt:'2099-01-01T00:00:00.000Z'}});
      if(path==='/notifications')return reply(200,{items:[],nextCursor:null});
      if(path==='/consent')return reply(200,{ai:{granted:false,version:null,at:null}});
      if(path==='/highlight'){analysisCalls++;return reply(503,{});}
      return reply(404,{error:{code:'not_found',message:'Unavailable',requestId:'fixture'}});
    });
    await page.goto(base+'/inbox');await page.waitForResponse(r=>r.url().endsWith('/v1/flags'));
    const entry=page.getByRole('button',{name:'Highlight screenshot',exact:true});
    if(mode==='on'){await entry.waitFor();await entry.click();await page.getByText('Choose a screenshot',{exact:true}).waitFor();}
    else{assert.equal(await entry.count(),0);await page.goto(base+'/highlight');await page.getByText('Screenshot highlight is unavailable',{exact:true}).waitFor();assert.equal(await page.getByText('Choose a screenshot',{exact:true}).count(),0);}
    await page.screenshot({path:`${proof}/highlight-${mode}-${width}.png`,fullPage:true});
    assert.equal(analysisCalls,0);assert(flagsCalls>=1);assert.deepEqual(errors,[]);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await context.close();
  }
  console.log('PASS: Highlight entry/direct route on/off/malformed/unavailable, public credential-free flags and no analysis calls at393/1440. Screenshots: '+proof);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
