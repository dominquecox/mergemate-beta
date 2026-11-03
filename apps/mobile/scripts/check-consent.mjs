import {fixtureApiUrl} from './fixture-api.mjs';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
// Exercises the exported web app against a stateful fixture of the AI choices API. No live API, account or provider.
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../dist');
const proof=process.env.MM_CONSENT_PROOF_DIR ?? '/tmp/mergemate-consent';
await mkdir(proof,{recursive:true});
const server=createServer(async(req,res)=>{
  try{
    const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
    let body,file=path;
    if(!path.startsWith(root+sep)&&path!==root){res.writeHead(404).end();return;}
    try{body=await readFile(path);}catch{file=resolve(root,'index.html');body=await readFile(file);}
    const type={'.js':'application/javascript','.css':'text/css','.png':'image/png','.ttf':'font/ttf'}[extname(file)]??'text/html';
    res.writeHead(200,{'content-type':type});res.end(body);
  }catch{res.writeHead(500).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const launch=process.env.MM_CHROME_PATH?{executablePath:process.env.MM_CHROME_PATH}:{channel:'chrome'};
const browser=await chromium.launch({headless:true,...launch});
try{
 for(const width of [393,1440]){
  // The fixture is the "server": it owns the truth and the tests change it behind the app's back.
  const db={granted:false,summaries:true,revision:1,failWrites:false,conflictNext:false,writes:[],reads:0,user:'one'};
  const prefs=()=>({ai:{granted:db.granted,version:'1',currentVersion:'1'},aiSummaries:db.summaries,revision:`r${db.revision}`});
  const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block'});
  const errors=[];
  await context.route('**/*',async route=>{
   const request=route.request(),url=fixtureApiUrl(request.url(),base);if(url.origin===base||url.protocol==='data:')return route.continue();
   if(url.origin!=='https://api-dev.mergemate.dev')return route.abort();
   const headers={'content-type':'application/json','access-control-allow-origin':base,'access-control-allow-credentials':'true','access-control-allow-headers':'content-type,x-csrf-token','access-control-allow-methods':'GET,POST,PUT,DELETE,OPTIONS'};
   const reply=(status,body)=>route.fulfill({status,headers,body:status===204?'':JSON.stringify(body)});
   const err=(status,code,message='Fixture failure.')=>reply(status,{error:{code,message,requestId:'fixture'}});
   if(request.method()==='OPTIONS')return reply(204,null);
   const path=url.pathname.replace('/v1','');
   if(path==='/flags')return reply(200,{voice_readout:false,voice_notes:false,highlight:false});
   if(path==='/me')return reply(200,{id:`fixture-${db.user}`,login:db.user,name:db.user,avatarUrl:base+'/favicon.ico',demo:false});
   if(path==='/auth/refresh')return reply(200,{session:{expiresAt:'2099-01-01T00:00:00.000Z',csrfToken:'c'}});
   if(path==='/auth/csrf')return reply(200,{csrfToken:'c'});
   if(path==='/notifications')return reply(200,{items:[],nextCursor:null});
   if(path==='/settings')return reply(200,{notifications:{review:true,mention:true,mine:true},quietHours:null,aiSummaries:db.summaries});
   if(path==='/billing/plan')return reply(200,{plan:'free',status:'none',renewsAt:null,cancelAt:null,trialEligible:false,canManage:false});
   if(path==='/consent/preferences'&&request.method()==='GET'){db.reads++;return reply(200,prefs());}
   if(path==='/consent/preferences'&&request.method()==='PUT'){
    const body=request.postDataJSON();db.writes.push(body);
    if(db.failWrites)return err(503,'upstream_unavailable','Fixture outage.');
    if(db.conflictNext){db.conflictNext=false;db.revision++;db.granted=true;return err(409,'consent_changed');}
    if(body.action!=='revoke'&&body.expectedRevision!==`r${db.revision}`)return err(409,'consent_changed');
    if(body.action==='grant'){db.granted=true;db.summaries=true;}
    else if(body.action==='revoke'){db.granted=false;db.summaries=false;}
    else{if(body.enabled&&!db.granted)return err(403,'consent_required');db.summaries=body.enabled;}
    db.revision++;return reply(200,prefs());
   }
   return err(404,'not_found');
  });
  const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  const sw=(name)=>page.getByRole('switch',{name,exact:true});
  const checked=async(name)=>(await sw(name).getAttribute('aria-checked'))==='true';
  const openSettings=async()=>{await page.goto(base+'/settings');await sw('AI processing').waitFor();};

  // 1. Fresh account: AI is off and summaries cannot be switched on by themselves.
  await openSettings();
  assert.equal(await checked('AI processing'),false);
  assert.equal(await sw('AI summaries and risk').isDisabled(),true);

  // 2. The disclosure is truthful and does not promise blanket consent, perfect detection or provider guarantees.
  await page.getByText('What is sent to AI',{exact:true}).click();
  await page.getByText('What may be sent to the AI model',{exact:true}).waitFor();
  const text=await page.locator('body').innerText();
  for(const need of ['Screenshots (Highlight)','Voice notes','pattern matching, not a guarantee','has not verified'])assert(text.includes(need),`disclosure should say: ${need}`);
  for(const banned of ['never stored','never used to train','NEVER sent','automatically masked','zero retention'])assert(!text.includes(banned),`disclosure must not claim: ${banned}`);
  await page.screenshot({path:`${proof}/disclosure-${width}.png`,fullPage:true});

  // 3. A failed save never shows "saved"; the form stays and offers another try.
  db.failWrites=true;
  await page.getByRole('button',{name:'I agree, turn on AI',exact:true}).click();
  await page.getByRole('alert').filter({hasText:/try again|Fixture outage/i}).first().waitFor();
  assert.equal(await page.getByText('AI is on',{exact:true}).count(),0);
  assert.equal(db.granted,false);
  await page.screenshot({path:`${proof}/failed-save-${width}.png`,fullPage:true});
  db.failWrites=false;
  await page.getByRole('button',{name:'I agree, turn on AI',exact:true}).click();
  await page.getByText('AI is on',{exact:true}).waitFor();
  assert.equal(db.granted,true);
  assert.deepEqual(db.writes.at(-1),{action:'grant',version:'1',expectedRevision:db.writes.at(-1).expectedRevision});

  // 4. Independent summaries preference; a failed change snaps back.
  await openSettings();
  assert.equal(await checked('AI processing'),true);
  assert.equal(await checked('AI summaries and risk'),true);
  db.failWrites=true;await sw('AI summaries and risk').click();
  await page.waitForTimeout(300);
  assert.equal(await checked('AI summaries and risk'),true,'switch must not claim a change the server refused');
  db.failWrites=false;await sw('AI summaries and risk').click();
  await page.waitForFunction(()=>[...document.querySelectorAll('[role=switch]')].some(s=>s.getAttribute('aria-label')==='AI summaries and risk'&&s.getAttribute('aria-checked')==='false'));
  assert.equal(db.summaries,false);assert.equal(db.granted,true);

  // 5. Foreground refresh picks up a change made elsewhere.
  db.summaries=true;db.revision++;
  await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForFunction(()=>[...document.querySelectorAll('[role=switch]')].some(s=>s.getAttribute('aria-label')==='AI summaries and risk'&&s.getAttribute('aria-checked')==='true'));

  // 6. A stale revision recovers: the server's state is shown with an explanation.
  db.conflictNext=true;await sw('AI summaries and risk').click();
  await page.getByText('Your AI choices changed elsewhere. Review them and try again.',{exact:true}).waitFor();
  assert.equal(await checked('AI processing'),true);

  // 7. Revoke saves at once and the switches follow the server.
  await sw('AI processing').click();
  await page.waitForFunction(()=>[...document.querySelectorAll('[role=switch]')].some(s=>s.getAttribute('aria-label')==='AI processing'&&s.getAttribute('aria-checked')==='false'));
  assert.equal(db.granted,false);assert.equal(db.summaries,false);
  assert.deepEqual(db.writes.at(-1),{action:'revoke'});
  assert.equal(await sw('AI summaries and risk').isDisabled(),true);

  // 8. Turning AI on from Settings opens the disclosure instead of agreeing silently.
  const writesBefore=db.writes.length;
  await sw('AI processing').click();
  await page.getByText('What may be sent to the AI model',{exact:true}).waitFor();
  assert.equal(db.writes.length,writesBefore);

  // 9. Sample-data demo: nothing to change and nothing is written.
  await page.evaluate(()=>localStorage.setItem('mergemate_demo_session','true'));
  const demoWrites=db.writes.length;
  await page.goto(base+'/consent');
  assert.equal(await page.getByRole('button',{name:'I agree, turn on AI',exact:true}).count(),0);
  assert.equal(db.writes.length,demoWrites);

  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);
  await context.close();
 }
 console.log('PASS: exported app consent disclosure, failed-save truthfulness, independent summaries, foreground refresh, stale-revision recovery, revoke, settings opens disclosure, demo read-only at 393/1440. API is a stateful fixture; screenshots: '+proof);
}finally{await browser.close();await new Promise(r=>server.close(r));}
