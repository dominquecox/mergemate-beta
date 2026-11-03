import {fixtureApiUrl} from './fixture-api.mjs';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {dirname,extname,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../dist'),fixture=resolve(here,'../../api/test/fixtures/highlight');
const proof='/private/tmp/mergemate-highlight';await mkdir(proof,{recursive:true});
const server=createServer(async(req,res)=>{try{let file=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+sep)&&file!==root){res.writeHead(404).end();return;}let body;try{body=await readFile(file);}catch{file=resolve(root,'index.html');body=await readFile(file);}res.writeHead(200,{'content-type':{'.js':'application/javascript','.css':'text/css','.png':'image/png','.ttf':'font/ttf','.ico':'image/x-icon'}[extname(file)]??'text/html','content-security-policy':`default-src 'self';script-src 'self';connect-src 'self' blob: https://api-dev.mergemate.dev;img-src 'self' data: blob: https://avatars.githubusercontent.com;style-src 'self' 'unsafe-inline';font-src 'self' data:;base-uri 'none';form-action 'self';frame-ancestors 'none'`}).end(body);}catch{res.writeHead(500).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;let browser;
try{
 browser=await chromium.launch({headless:true,channel:'chrome'});
 for(const width of [393,1440])for(const mode of ['on','off','consent-off','demo']){
  const context=await browser.newContext({viewport:{width,height:1050},serviceWorkers:'block'});const page=await context.newPage();page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',e=>errors.push(e.message));let calls=0,pendingResolve,held=false,userId='highlight-fixture';
  const reply=async(route,status,body)=>{try{await route.fulfill({status,headers:{'content-type':'application/json','access-control-allow-origin':base,'access-control-allow-credentials':'true','access-control-allow-headers':'content-type,x-csrf-token','access-control-allow-methods':'GET,POST,DELETE,OPTIONS'},body:JSON.stringify(body)});}catch{/* Explicitly cancelled fixture requests have no response consumer. */}};
  await context.route('**/*',async route=>{
   const request=route.request(),url=fixtureApiUrl(request.url(),base);if(url.origin===base||['blob:','data:'].includes(url.protocol))return route.continue();if(url.origin!=='https://api-dev.mergemate.dev')return route.abort();
   if(request.method()==='OPTIONS')return reply(route,204,undefined);const path=url.pathname.replace('/v1','');
   if(path==='/flags')return reply(route,200,{voice_readout:false,voice_notes:false,highlight:mode!=='off'});
   if(path==='/me')return reply(route,200,{id:userId,login:'fixture',name:'Fixture',avatarUrl:base+'/favicon.ico',demo:mode==='demo'});
   if(path==='/auth/refresh')return reply(route,200,{session:{expiresAt:'2099-01-01T00:00:00.000Z',csrfToken:'fixture-csrf',demo:mode==='demo'}});
   if(path==='/auth/csrf')return reply(route,200,{csrfToken:'fixture-csrf'});
   if(path==='/consent/preferences')return reply(route,200,{ai:{granted:mode!=='consent-off',version:'1',currentVersion:'1'},aiSummaries:true,revision:'fixture'});if(path==='/consent')return reply(route,200,{ai:{granted:mode!=='consent-off',version:'1',at:'2026-10-29T00:00:00.000Z'}});
   if(path==='/push/web-key')return reply(route,200,{publicKey:null});
   if(path==='/notifications')return reply(route,200,{items:[],nextCursor:null});
   if(path==='/highlight'){
    calls++;assert(request.postDataBuffer().length>60);if(calls===1)return reply(route,502,{error:{code:'upstream_unavailable',message:'Fixture provider failure',requestId:'fixture'}});
    if(held){await new Promise(resolve=>{pendingResolve=resolve;});return reply(route,200,{insight:'STALE_RESULT_MUST_NOT_RENDER',regions:[],requestId:'stale'});}
    return reply(route,200,{insight:'Review this area. <script>window.badHighlight=true</script>',regions:calls===4?[]:[{xMin:100,yMin:100,xMax:600,yMax:600,label:'Approximate button'}],requestId:'fixture'});
   }
   return reply(route,404,{error:{code:'not_found',message:'Unavailable',requestId:'fixture'}});
  });
  await page.goto(base+'/highlight');await page.getByRole('heading',{name:'Screenshot Insight',exact:true}).waitFor();
  const choose=page.getByRole('button',{name:/^Choose a (different )?screenshot$/});
  const pick=async name=>{const [chooser]=await Promise.all([page.waitForEvent('filechooser'),choose.click()]);await chooser.setFiles({name,mimeType:name.endsWith('.jpg')?'image/jpeg':'image/png',buffer:await readFile(resolve(fixture,name))});await page.getByRole('img',{name:'Selected screenshot',exact:true}).waitFor();};
  const analyze=page.getByRole('button',{name:'Analyze Screenshot with AI',exact:true});
  if(mode==='off'){await page.getByText('Screenshot highlight is unavailable',{exact:true}).waitFor();assert.equal(await choose.count(),0);}
  else if(mode==='consent-off'||mode==='demo'){await page.getByText(mode==='demo'?'Screenshots are unavailable in demo mode':'AI consent is required',{exact:true}).waitFor();assert.equal(await choose.count(),0);}
  else{
   await choose.waitFor();assert(await analyze.isDisabled());await pick('pixels.png');await page.getByRole('textbox',{name:'Optional reviewer note'}).fill('Inspect the button');await analyze.click();await page.getByText("Couldn't analyze screenshot",{exact:true}).waitFor();await page.screenshot({path:`${proof}/error-${width}.png`,fullPage:true});
   await page.getByRole('button',{name:'Try Again',exact:true}).click();await page.getByText('1. Approximate button',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.badHighlight),undefined);await page.screenshot({path:`${proof}/result-${width}.png`,fullPage:true});
   held=true;const prior=calls;await analyze.click();await page.waitForFunction(()=>document.body.innerText.includes('Analyzing screenshot...'));await pick('metadata.jpg');held=false;pendingResolve?.();await page.getByRole('button',{name:'Analyze Screenshot with AI',exact:true}).waitFor();assert.equal(await page.getByText('No screenshot analyzed yet',{exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Choose Screenshot',exact:true}).count(),0);assert.equal(await page.getByText('STALE_RESULT_MUST_NOT_RENDER',{exact:true}).count(),0);assert.equal(calls,prior+1);
   await analyze.click();await page.getByText('No reliable region was suggested. Read the explanation and inspect the image yourself.',{exact:true}).waitFor();await page.screenshot({path:`${proof}/no-regions-${width}.png`,fullPage:true});
   await page.getByRole('button',{name:'Remove screenshot',exact:true}).click();await choose.waitFor();assert(await analyze.isDisabled());assert.equal(await page.getByRole('img',{name:'Selected screenshot',exact:true}).count(),0);
   await pick('pixels.png');userId='other-fixture';const refreshed=page.waitForResponse(response=>response.url().endsWith('/v1/me'));await page.evaluate(()=>{const peer=new BroadcastChannel('mergemate-session-v1');peer.postMessage({v:1,kind:'signed-in'});peer.close();});await refreshed;await page.getByRole('img',{name:'Selected screenshot',exact:true}).waitFor({state:'hidden'});await choose.waitFor();
   await pick('pixels.png');await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});document.dispatchEvent(new Event('visibilitychange'));});await choose.waitFor();assert.equal(await page.getByRole('img',{name:'Selected screenshot',exact:true}).count(),0);
  }
  if(mode!=='on')assert.equal(calls,0);assert.deepEqual(errors,[]);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:`${proof}/${mode}-${width}.png`,fullPage:true});await context.close();
 }
 console.log('PASS Highlight browser:8 scenarios393/1440, actual file picker, failure/retry, safe rendering, stale replacement, empty regions, remove/account-switch/background and flag/consent/demo gates. API/model fixture replies only.');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
