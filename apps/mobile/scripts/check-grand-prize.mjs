import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../dist'),proof='/tmp/mergemate-grand-prize';await mkdir(proof,{recursive:true});
const server=createServer(async(req,res)=>{try{let path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(path!==root&&!path.startsWith(root+sep)){res.writeHead(404).end();return;}let body;try{body=await readFile(path);}catch{path=resolve(root,'index.html');body=await readFile(path);}res.writeHead(200,{'content-type':{'.js':'application/javascript','.png':'image/png','.css':'text/css','.ttf':'font/ttf','.json':'application/json','.woff2':'font/woff2'}[extname(path)]??'text/html'}).end(body);}catch{res.writeHead(500).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`,sha='a'.repeat(40),date='2026-11-01T12:00:00Z';
const visualSource=await readFile(resolve(here,'../src/workspace/visual.ts'),'utf8'),encoded=JSON.parse(/const previews=(\[.*\]);/.exec(visualSource)[1]);
const metric={provider:'workers-ai',modelId:'@cf/meta/llama-3.2-11b-vision-instruct',environment:'Cloudflare Workers AI',latencyMs:73,promptTokens:123,completionTokens:45,precision:null,observedAt:date,requestId:'fixture-observed-request',responseJson:JSON.stringify({segments:[{bbox:[0.2,0.2,0.4,0.4]}]})};
const segment={id:'target',label:'Checkout Button',bbox:[0.5,0.6,0.65,0.7],touchTargetSizePt:{width:32,height:32},touchTargetCompliant:false,higViolation:'Estimated below 44pt'};
const files=[{path:'src/auth.ts',status:'modified',additions:3,deletions:1,patch:"@@ -1 +1,3 @@\n-requireAuth(ctx);\n+import x from 'ghost-sdk';\n+const permissions = ['*'];\n+return { status: 200 };",patchState:'available'},{path:'assets/screen.png',status:'modified',additions:0,deletions:0,patchState:'unavailable'}];
const overview=n=>({repo:'acme/app',number:n,title:n===7?'Agent authored payment change':'Docs clarification',body:'Controlled fixture',author:n===7?'codex-bot':'jules-bot',status:'open',baseBranch:'main',headBranch:'codex/review',headSha:sha,additions:3,deletions:1,changedFiles:n===7?2:1,files:[],checks:[],threads:[],checkCursor:'checks:1',createdAt:date,updatedAt:date,htmlUrl:`https://github.com/acme/app/pull/${n}`,mergeState:'clean'});
let browser;
try{browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});for(const width of [393,1440]){
 const context=await browser.newContext({viewport:{width,height:1000},permissions:['clipboard-read','clipboard-write'],serviceWorkers:'block',reducedMotion:'reduce'});
 await context.addInitScript(()=>{
  window.__spoken=[];window.__speechStops=0;window.__speechPaused=0;window.__speechResumed=0;window.__fixtureHidden=false;
  Object.defineProperty(window,'SpeechSynthesisUtterance',{configurable:true,value:class {constructor(text){this.text=text;}}});
  Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>window.__fixtureHidden?'hidden':'visible'});
  Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{getVoices:()=>[{name:'Fixture local voice',voiceURI:'fixture',lang:'en-US',localService:true}],speak:u=>{window.__spoken.push({text:u.text,rate:u.rate});},cancel:()=>{window.__speechStops++;},pause:()=>{window.__speechPaused++;},resume:()=>{window.__speechResumed++;}}});
 });
 const page=await context.newPage();page.setDefaultTimeout(20000);const errors=[],writes=[];let failedChoice=false,aiCalls=0;
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/api\.github\.com|api\.meta\.ai/.test(r.url()))writes.push(r.url());});
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());if(url.protocol==='data:')return route.continue();if(url.origin!==base)return route.abort();if(!url.pathname.startsWith('/__api/v1'))return route.continue();
  const path=url.pathname.replace('/__api/v1',''),reply=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  if(path==='/me')return reply({id:'fixture',login:'fixture',name:'Fixture User',avatarUrl:base+'/favicon.ico',demo:false});
  if(path==='/flags')return reply({voice_readout:true,voice_notes:false,highlight:true});
  if(path==='/auth/refresh')return reply({session:{expiresAt:'2099-01-01T00:00:00Z',csrfToken:'fixture'}});
  if(path==='/auth/csrf')return reply({csrfToken:'fixture'});
  if(path==='/consent/preferences')return reply({ai:{granted:true,version:'1',currentVersion:'1'},aiSummaries:true,revision:'fixture'});
  if(path==='/consent')return reply({ai:{granted:true,version:'1',currentVersion:'1'}});
  if(path==='/push/web-key')return reply({publicKey:null});
  if(path==='/notes')return reply({items:[]});
  if(path==='/notifications')return reply({items:[7,8].map(n=>({id:String(n),kind:'review',repo:'acme/app',number:n,title:overview(n).title,author:overview(n).author,status:'open',risk:n===7?'high':'low',updatedAt:date,read:false})),nextCursor:null});
  if(path==='/triage')return reply([7,8].map(n=>({prRef:`acme/app#${n}`,title:overview(n).title,author:overview(n).author,lane:'needs_you',reason:n===7?'Security review required':'Docs review'})));
  if(path.startsWith('/triage/')){if(req.method()==='DELETE')return route.fulfill({status:204});if(!failedChoice){failedChoice=true;return reply({error:{code:'upstream_unavailable',message:'Temporary fixture error',requestId:'fixture'}},503);}return reply({prRef:decodeURIComponent(path.slice('/triage/'.length)),lane:req.postDataJSON().lane});}
  if(path==='/highlight'){aiCalls++;return reply({insight:'Inspect the target.',regions:[],segments:[segment],requestId:metric.requestId,telemetry:metric});}
  const match=/^\/prs\/acme\/app\/(7|8)(.*)$/.exec(path);if(match){const n=Number(match[1]),suffix=match[2];
   if(!suffix)return reply({...overview(n),checks:url.searchParams.has('workspace')?[]:[{id:'c',name:'CI',state:'success'}]});
   if(suffix==='/dependencies')return reply({headSha:sha,manifests:[{directory:'',names:['react']}],unavailable:[]});
   if(suffix==='/summary'){aiCalls++;return reply({whatChanged:'Updates the review flow.',whyItMatters:'Review changes carefully.',suggestedFocus:[],coverage:{analyzedFiles:2,skippedFiles:0,truncatedFiles:0},model:'workers-ai:'+metric.modelId,telemetry:metric});}
   if(suffix==='/risk'){aiCalls++;return reply({level:'low',reasons:['Small change'],coverage:{analyzedFiles:2,skippedFiles:0,truncatedFiles:0}});}
   if(suffix==='/visual')return reply({path:'assets/screen.png',side:url.searchParams.get('side'),dataUrl:'data:image/png;base64,'+encoded[url.searchParams.get('side')==='before'?0:1],width:393,height:240,headSha:sha});
   if(suffix.startsWith('/pages/'))return reply({items:suffix.endsWith('/files')?(n===7?files:[{path:'docs/config.json',status:'modified',additions:1,deletions:0,patch:'@@ -1 +1 @@\n-{}\n+{"ready":true}',patchState:'available'}]):suffix.endsWith('/checks')?[{id:'c',name:'CI',state:'success'}]:[],nextCursor:null,headSha:sha});
  }
  return reply({error:{code:'not_found',message:'Fixture unavailable',requestId:'fixture'}},404);
 });
 const target=async locator=>{await locator.waitFor();await locator.scrollIntoViewIfNeeded();const box=await locator.boundingBox();assert(box&&box.width>=44&&box.height>=44,JSON.stringify(box));};
 await page.goto(base+'/pr/acme/app/7');await page.getByText(/Import is not declared.*ghost-sdk/).waitFor();assert((await page.locator('body').innerText()).includes('Agent Guardrails Alert'));assert.equal(await page.getByRole('button',{name:'Approve & Ship',exact:true}).count(),0);
 const listen=page.getByRole('button',{name:'Listen to Executive Digest',exact:true});await target(listen);const beforeAudio=aiCalls;await listen.click();await page.getByRole('button',{name:'Pause Executive Digest',exact:true}).waitFor();assert((await page.evaluate(()=>window.__spoken)).length>0);
 await page.getByRole('button',{name:'Change commute narration speed',exact:true}).click();await page.waitForFunction(()=>window.__spoken.at(-1)?.rate===1.25);await page.getByRole('button',{name:'Pause Executive Digest',exact:true}).click();await page.getByRole('button',{name:'Resume Executive Digest',exact:true}).click();
 assert.equal(aiCalls,beforeAudio);assert.equal(await page.evaluate(()=>window.__speechPaused),1);assert.equal(await page.evaluate(()=>window.__speechResumed),1);const beforeBackground=await page.evaluate(()=>window.__speechStops);await page.evaluate(()=>{window.__fixtureHidden=true;document.dispatchEvent(new Event('visibilitychange'));});await page.getByRole('button',{name:'Listen to Executive Digest',exact:true}).waitFor();await page.waitForFunction(before=>window.__speechStops>before,beforeBackground);
 await page.goto(base+'/pr/acme/app/7');await page.getByRole('button',{name:/llama-3.2.*Workers AI/}).waitFor();await page.getByRole('button',{name:/llama-3.2.*Workers AI/}).click();await page.getByRole('heading',{name:'Meta Execution Inspector',exact:true}).waitFor();const text=await page.locator('body').innerText();assert(text.includes('Latency: 73 ms'));assert(text.includes('Prompt tokens: 123'));assert(text.includes('Precision: Not reported'));assert(!text.includes('FP16'));await page.getByRole('button',{name:'Close Telemetry',exact:true}).click();
 await page.getByRole('button',{name:'Analyze UI Targets',exact:true}).click();await page.getByRole('button',{name:'Inspect image region Checkout Button',exact:true}).waitFor();await page.getByRole('button',{name:'Inspect image region Checkout Button',exact:true}).click();const copyFix=page.getByRole('button',{name:'Copy Fix',exact:true});await target(copyFix);await copyFix.click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'style={{ minHeight: 44, minWidth: 44 }}');await page.screenshot({path:`${proof}/inspection-${width}.png`,fullPage:true});
 await page.goto(base+'/triage');await page.getByText('0 of 2',{exact:true}).waitFor();await page.getByRole('button',{name:'Ignore',exact:true}).click();await page.getByRole('alert').first().waitFor();await page.getByText('0 of 2',{exact:true}).waitFor();await page.getByRole('button',{name:'Ignore',exact:true}).click();await page.getByText('1 of 2',{exact:true}).waitFor();await page.getByRole('button',{name:'Undo last triage choice',exact:true}).click();await page.getByText('0 of 2',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Ignore',exact:true}).click();await page.getByText('1 of 2',{exact:true}).waitFor();await page.getByRole('button',{name:'Needs you',exact:true}).click();await page.getByText('All Caught Up!',{exact:true}).waitFor();const exportButton=page.getByRole('button',{name:'Export Morning Executive Brief',exact:true});await target(exportButton);await exportButton.click();await page.getByText('Copied to Clipboard',{exact:true}).waitFor();const brief=await page.evaluate(()=>navigator.clipboard.readText());assert(brief.includes('2 successfully triaged PRs'));assert.equal((brief.match(/^- \*\*PR /gm)??[]).length,2);assert.equal((brief.match(/\*\*PR #7\*\*/g)??[]).length,1);assert(brief.includes('Observed triage elapsed time:'));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`${proof}/brief-${width}.png`,fullPage:true});assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);console.log(`PASS ${width}: guardrail escalation, local audio lifecycle/rates, observed telemetry, copy fix, failure/undo-aware executive export; fixture requests only`);await context.close();
 }}finally{await browser?.close();await new Promise(r=>server.close(r));}
