import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../dist');
const proof=process.env.MM_READOUT_PROOF_DIR ?? '/private/tmp/mergemate-readout';
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
 browser=await chromium.launch({headless:true,channel:'chrome'});const base=`http://127.0.0.1:${port}`;
 for(const width of [393,1440])for(const mode of ['on','off','malformed','error','remote-only']){
  const context=await browser.newContext({viewport:{width,height:1100},serviceWorkers:'block'});let flag=mode==='on'||mode==='remote-only'?true:mode==='malformed'?'true':false;let aiCalls=0;
  await context.addInitScript(remote=>{
   window.__speech={spoken:[],cancelled:0,paused:0,resumed:0,last:null};
   const fixture=window.__speech;
   Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>[{localService:!remote,name:'Fixture local voice',voiceURI:'fixture'}],speak:utterance=>{fixture.spoken.push(utterance.text);fixture.last=utterance;},cancel:()=>{fixture.cancelled++;},pause:()=>{fixture.paused++;},resume:()=>{fixture.resumed++;}}});
   window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
   const original=Date.now;window.__readoutClock=0;Date.now=()=>original()+window.__readoutClock;
  },mode==='remote-only');
  const page=await context.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());if(url.origin===base||url.protocol==='data:')return route.continue();if(url.origin!=='https://api-dev.mergemate.dev')return route.abort();
   const headers={'content-type':'application/json','access-control-allow-origin':base,'access-control-allow-credentials':'true','access-control-allow-headers':'content-type,x-csrf-token','access-control-allow-methods':'GET,POST,DELETE,OPTIONS'};
   const reply=(status,body)=>route.fulfill({status,headers,body:JSON.stringify(body)});if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});const path=url.pathname.replace('/v1','');
   if(path==='/flags')return reply(mode==='error'?503:200,mode==='error'?{error:{code:'upstream_unavailable',message:'Unavailable',requestId:'fixture'}}:{voice_readout:flag,voice_notes:false});
   if(path==='/me')return reply(200,{id:'fixture-user',login:'fixture',name:'Fixture',avatarUrl:base+'/favicon.ico',demo:false});
   if(path==='/auth/refresh')return reply(200,{session:{expiresAt:'2099-01-01T00:00:00.000Z'}});
   if(path==='/auth/csrf')return reply(200,{csrfToken:'fixture-csrf'});
   if(path==='/notifications')return reply(200,{items:[],nextCursor:null});
   if(path==='/consent')return reply(200,{ai:{granted:true,version:'1',at:'2026-10-28T12:00:00.000Z'}});
   if(path==='/prs/fixture/repo/7')return reply(200,{repo:'fixture/repo',number:7,title:'A safe review',body:'Existing review body.',author:'fixture',status:'open',baseBranch:'main',headBranch:'feature',headSha:'abc123',additions:3,deletions:1,changedFiles:1,files:[],checks:[],threads:[],createdAt:'2026-10-28T10:00:00.000Z',updatedAt:'2026-10-28T12:00:00.000Z',htmlUrl:'https://github.com/fixture/repo/pull/7'});
   if(path.endsWith('/summary')){aiCalls++;return reply(200,{whatChanged:'The review screen is clearer. ghp_fixture_secret_should_never_be_spoken',whyItMatters:'It is easier to scan.',suggestedFocus:['Check the loading state.'],coverage:{analyzedFiles:1,skippedFiles:0,truncatedFiles:0}});}
   if(path.endsWith('/risk')){aiCalls++;return reply(200,{level:'low',reasons:['A focused change.','Secrets detected in private.env'],secretFindings:[{file:'private.env',line:1,rule:'fixture'}],coverage:{analyzedFiles:1,skippedFiles:0,truncatedFiles:0}});}
   return reply(404,{error:{code:'not_found',message:'Unavailable',requestId:'fixture'}});
  });
  const flagsResponse=page.waitForResponse(r=>r.url().endsWith('/v1/flags'));await page.goto(base+'/inbox');await flagsResponse;await page.getByRole('heading',{name:'Inbox',exact:true}).waitFor();
  const play=page.getByRole('button',{name:'Play Inbox overview',exact:true});
  if(mode==='off'||mode==='malformed'||mode==='error'){assert.equal(await play.count(),0);assert.equal(await page.evaluate(()=>window.__speech.spoken.length),0);}
  else{
   await play.waitFor();await play.click();
   if(mode==='remote-only'){await page.getByText(/No installed local voice is available/).waitFor();assert.equal(await page.evaluate(()=>window.__speech.spoken.length),0);}
   else{
    await page.getByText('Reading with a local device voice.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.__speech.spoken.length),1);
    await page.getByRole('button',{name:'Pause Inbox overview',exact:true}).click();await page.getByText(/Paused. On devices/).waitFor();await page.screenshot({path:`${proof}/readout-paused-${width}.png`,fullPage:true});
    await page.getByRole('button',{name:'Resume Inbox overview',exact:true}).click();assert.equal(await page.evaluate(()=>window.__speech.paused),1);assert.equal(await page.evaluate(()=>window.__speech.resumed),1);
    await page.getByRole('button',{name:'Change readout speed',exact:true}).click();await page.getByRole('button',{name:'Stop Inbox overview',exact:true}).click();
    await play.click();const backgroundCancels=await page.evaluate(()=>window.__speech.cancelled);await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});document.dispatchEvent(new Event('visibilitychange'));});await play.waitFor({state:'hidden'});assert((await page.evaluate(()=>window.__speech.cancelled))>backgroundCancels);const speechAtBackground=await page.evaluate(()=>window.__speech.spoken.length);await page.evaluate(()=>{window.__readoutClock+=6000;Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'visible'});document.dispatchEvent(new Event('visibilitychange'));});await play.waitFor();assert.equal(await page.evaluate(()=>window.__speech.spoken.length),speechAtBackground);
    const cancels=await page.evaluate(()=>window.__speech.cancelled);await play.click();await page.getByRole('button',{name:'Search pull requests',exact:true}).last().click();await page.getByRole('heading',{name:'Search & Filters',exact:true}).waitFor();assert((await page.evaluate(()=>window.__speech.cancelled))>cancels);
    await page.goto(base+'/pr/fixture/repo/7');await page.getByRole('button',{name:'Play Pull request summary',exact:true}).waitFor();await page.getByText('It is easier to scan.',{exact:true}).waitFor();const before=aiCalls;
    await page.getByRole('button',{name:'Play Pull request summary',exact:true}).click();await page.getByText('Reading with a local device voice.',{exact:true}).waitFor();await page.screenshot({path:`${proof}/readout-pr-playing-${width}.png`,fullPage:true});
    for(let i=0;i<12;i++)await page.evaluate(()=>window.__speech.last?.onend?.());
    assert.equal(aiCalls,before);assert((await page.evaluate(()=>window.__speech.spoken.join(' '))).includes('The review screen is clearer.'));assert(!/ghp_|Secrets|private.env/.test(await page.evaluate(()=>window.__speech.spoken.join(' '))));
    await page.getByRole('button',{name:'Play Pull request summary',exact:true}).click();flag=false;
    await page.evaluate(()=>{window.__readoutClock+=6000;document.dispatchEvent(new Event('visibilitychange'));});
    await page.getByRole('button',{name:'Play Pull request summary',exact:true}).waitFor({state:'hidden'});assert.equal(await page.getByRole('button',{name:'Pause Pull request summary',exact:true}).count(),0);
   }
  }
  await page.screenshot({path:`${proof}/readout-${mode}-${width}.png`,fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS: default-off/malformed/error/local-only voices, Play/Pause/Resume/Stop/speed, route/background/foreground/flag cancellation, filtered existing PR text and zero added AI calls at393/1440. Speech and API transports are mocked; screenshots: '+proof);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
