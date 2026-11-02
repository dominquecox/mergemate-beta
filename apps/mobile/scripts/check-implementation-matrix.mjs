import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../dist'),proof='/tmp/mergemate-mm085';await mkdir(proof,{recursive:true});
const server=createServer(async(req,res)=>{try{let path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!path.startsWith(root+sep)){res.writeHead(404).end();return;}let body;try{body=await readFile(path);}catch{path=resolve(root,'index.html');body=await readFile(path);}res.writeHead(200,{'content-type':{'.js':'application/javascript','.css':'text/css','.ttf':'font/ttf','.png':'image/png'}[extname(path)]??'text/html'}).end(body);}catch{res.writeHead(500).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;let browser;
try{browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});for(const width of [393,1440]){
 const context=await browser.newContext({viewport:{width,height:1000},timezoneId:'America/New_York'});const page=await context.newPage();page.setDefaultTimeout(20000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));let reads=0,marked=false,saved=null;
 let settings={notifications:{review:true,mention:true,mine:true},quietHours:{start:'22:00',end:'07:00',timeZone:'America/New_York'},aiSummaries:true};
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());if(url.origin!==base)return route.abort();if(!url.pathname.startsWith('/__api/v1'))return route.continue();
  const path=url.pathname.replace('/__api/v1',''),reply=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  if(path==='/me')return reply({id:'fixture',login:'fixture',name:'Fixture User',avatarUrl:base+'/favicon.ico',demo:false});
  if(path==='/auth/refresh')return reply({session:{expiresAt:'2099-01-01T00:00:00Z',csrfToken:'fixture'}});
  if(path==='/auth/csrf')return reply({csrfToken:'fixture'});
  if(path==='/flags')return reply({voice_readout:true,voice_notes:false,highlight:false});
  if(path==='/consent/preferences')return reply({ai:{granted:true,version:'1',currentVersion:'1'},aiSummaries:true,revision:'fixture'});
  if(path==='/settings'){if(req.method()==='PUT'){saved=req.postDataJSON();settings=saved;}return reply(settings);}
  if(path==='/billing/plan')return reply({plan:'free',status:'none',renewsAt:null,cancelAt:null,trialEligible:false,canManage:false});
  if(path==='/settings/meta-key')return reply({configured:false});
  if(path==='/notifications'){reads++;return reply({items:[{id:'inbox',kind:'review',repo:'acme/app',number:7,title:'Review this change',author:'pr-author',status:'open',updatedAt:new Date().toISOString(),read:false}],nextCursor:null});}
  if(path==='/activity/history')return reply({items:[{id:'audit:7',kind:'review',repo:'acme/app',number:7,title:'Pull request #7',author:'unknown',actor:'event-reviewer',event:'review',status:null,updatedAt:new Date().toISOString(),read:marked}],nextCursor:null});
  if(path==='/activity/history/audit%3A7/read'){marked=true;return route.fulfill({status:204});}
  return reply({error:{code:'not_found',message:'Fixture missing',requestId:'fixture'}},404);
 });
 const target=async locator=>{await locator.scrollIntoViewIfNeeded();const box=await locator.boundingBox();assert(box&&box.width>=44&&box.height>=44);};
 await page.goto(base+'/notifications');await page.getByText('Review this change',{exact:true}).waitFor();
 await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,value:false});window.dispatchEvent(new Event('offline'));});await page.getByText(/Offline. Reconnecting automatically/).waitFor();const before=reads;
 await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,value:true});window.dispatchEvent(new Event('online'));});await page.waitForFunction(()=>!document.body.innerText.includes('Offline. Reconnecting automatically'));await new Promise(r=>setTimeout(r,300));assert(reads>before);
 const history=page.getByRole('button',{name:'Event history',exact:true});await target(history);await history.click();await page.getByText('@event-reviewer',{exact:true}).waitFor();assert((await page.locator('body').innerText()).includes('Actor is the event sender'));assert.equal(await page.getByText('Open',{exact:true}).count(),0);
 await page.screenshot({path:`${proof}/history-${width}.png`,fullPage:true});
 await page.goto(base+'/settings');const start=page.getByLabel('Quiet hours start (HH:MM)',{exact:true});await start.waitFor();await target(start);await start.fill('21:30');await page.getByLabel('Quiet hours end (HH:MM)',{exact:true}).fill('06:15');await page.getByLabel('Quiet hours time zone',{exact:true}).fill('America/Indiana/Indianapolis');
 const save=page.getByRole('button',{name:'Save quiet schedule',exact:true});await target(save);await save.click();await page.waitForTimeout(300);assert.deepEqual(saved?.quietHours,{start:'21:30',end:'06:15',timeZone:'America/Indiana/Indianapolis'});
 await start.fill('25:30');const prior=saved;await save.click();await page.getByRole('alert').filter({hasText:/Use different HH:MM/}).waitFor();assert.equal(saved,prior);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`${proof}/schedule-${width}.png`,fullPage:true});assert.deepEqual(errors,[]);console.log(`PASS ${width}: day-grouped event actor/unknown status, reconnect revalidation, quiet schedule validation/save, >=44 controls, no overflow; fixture API only`);await context.close();
}}finally{await browser?.close();await new Promise(r=>server.close(r));}
