import {createHash} from 'node:crypto';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../dist');
const proof=process.env.MM_SESSION_PROOF_DIR ?? '/private/tmp/mergemate-session-lifecycle';
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
 for(const width of [393,1440]){
  let signedIn=false,current='one',nextAccount='one',stateCount=0,callbackCount=0,activeRefresh=0,maxRefresh=0,refreshDelay=40,offlineLogout=false;const states=new Map();const errors=[];
  const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block'});
  await context.addInitScript(()=>{
   localStorage.setItem('mergemate_demo_session','true');
   window.__speech={spoken:[],cancelled:0};const fixture=window.__speech;
   Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>[{localService:true,name:'Fixture local voice',voiceURI:'fixture'}],speak:utterance=>fixture.spoken.push(utterance.text),cancel:()=>{fixture.cancelled++;},pause:()=>{},resume:()=>{}}});
   window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
  });
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());if(url.origin===base||url.protocol==='data:')return route.continue();
   if(url.origin==='https://github.com'&&url.pathname==='/login/oauth/authorize')return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Mock GitHub</title><p>Fixture authorization transport only.</p>'});
   if(url.origin!=='https://api-dev.mergemate.dev')return route.abort();
   const headers={'content-type':'application/json','access-control-allow-origin':base,'access-control-allow-credentials':'true','access-control-allow-headers':'content-type,x-csrf-token','access-control-allow-methods':'GET,POST,PUT,DELETE,OPTIONS'};
   const reply=(status,body)=>route.fulfill({status,headers,body:status===204?'':JSON.stringify(body)});const fail=(status,code)=>reply(status,{error:{code,message:'Fixture failure.',requestId:'fixture'}});
   if(request.method()==='OPTIONS')return reply(204,null);const path=url.pathname.replace('/v1','');
   const user=()=>({id:`fixture-${current}`,login:`fixture-${current}`,name:`Fixture ${current}`,avatarUrl:base+'/favicon.ico',demo:false});
   if(path==='/auth/github/start'){const body=request.postDataJSON();assert.equal(body.platform,'web');const state=`fixture-state-${++stateCount}`;states.set(state,body.codeChallenge);return reply(200,{state,authorizeUrl:`https://github.com/login/oauth/authorize?state=${state}&code_challenge=${body.codeChallenge}&code_challenge_method=S256`});}
   if(path==='/auth/github/callback'){callbackCount++;const body=request.postDataJSON(),challenge=states.get(body.state);states.delete(body.state);if(!challenge||createHash('sha256').update(body.codeVerifier).digest('base64url')!==challenge)return fail(403,'forbidden');signedIn=true;current=nextAccount;return reply(200,{session:{expiresAt:'2099-01-01T00:00:00.000Z',csrfToken:'fixture-csrf'},user:user()});}
   if(path==='/auth/logout'){if(offlineLogout)return route.abort('internetdisconnected');signedIn=false;return reply(204,null);}
   if(path==='/flags')return reply(200,{voice_readout:true,voice_notes:false,highlight:false});
   if(!signedIn)return fail(401,'unauthorized');
   if(path==='/inbox/preference')return reply(200,{filter:'all'});
   if(path==='/inbox/undo')return reply(200,null);
   if(path==='/me')return reply(200,user());
   if(path==='/auth/csrf')return reply(200,{csrfToken:'fixture-csrf'});
   if(path==='/auth/refresh'){activeRefresh++;maxRefresh=Math.max(maxRefresh,activeRefresh);await new Promise(resolve=>setTimeout(resolve,refreshDelay));activeRefresh--;return reply(200,{session:{expiresAt:'2099-01-01T00:00:00.000Z',csrfToken:'fixture-csrf'}});}
   if(path==='/me/installations')return reply(200,{items:[{id:'fixture-install',account:'fixture',accountType:'User',status:'active',manageUrl:'https://github.com/settings/installations/1'}],installUrl:'https://github.com/apps/fixture/installations/new'});
   if(path==='/notifications')return reply(200,{items:[{id:'fixture-notification',kind:'review',repo:`fixture-${current}/repo`,number:7,title:`Private review for ${current}`,author:'fixture',status:'open',updatedAt:'2026-10-28T12:00:00.000Z',read:false}],nextCursor:null});
   if(path==='/settings')return reply(200,{notifications:{review:true,mention:true,mine:false},quietHours:null,aiSummaries:false});
   if(path==='/billing/plan')return reply(200,{plan:'free',status:'active',renewsAt:null,cancelAt:null});
   if(path==='/consent/preferences')return reply(200,{ai:{granted:false,version:'1',currentVersion:'1'},aiSummaries:true,revision:'fixture'});if(path==='/consent')return reply(200,{ai:{granted:false,version:null,at:null}});
   return fail(404,'not_found');
  });
  const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
  async function start(page){if(new URL(page.url()).pathname!=='/sign-in')await page.goto(base+'/sign-in');await page.getByRole('button',{name:/^(Continue with GitHub|Try Again)$/}).first().click();await page.waitForURL('https://github.com/**');return `fixture-state-${stateCount}`;}
  async function finish(page,state){await page.goto(`${base}/auth/callback?code=fixture-code&state=${state}`);await page.waitForURL('**/inbox');await page.getByText(`Private review for ${current}`,{exact:true}).waitFor();}
  await page.goto(base+'/inbox');await page.waitForURL('**/sign-in');assert.equal(await page.getByText('Private review for one',{exact:true}).count(),0);
  const first=await start(page);await finish(page,first);assert.equal(await page.getByRole('button',{name:'Exit demo mode',exact:true}).count(),0);assert.equal(await page.evaluate(()=>localStorage.getItem('mergemate_demo_session')),'false');
  assert(!(await page.url()).includes('code='));assert.equal(await page.evaluate(()=>sessionStorage.getItem('mergemate_pending_sign_in')),null);await page.screenshot({path:`${proof}/signed-in-${width}.png`,fullPage:true});
  await page.goto(`${base}/auth/callback?code=fixture-code&state=${first}`);await page.waitForURL('**/sign-in');assert.equal(callbackCount,1);
  const denied=await start(page);await page.goto(`${base}/auth/callback?error=access_denied&state=${denied}&error_description=Fixture-denial`);await page.waitForURL('**/sign-in');assert.equal(await page.evaluate(()=>sessionStorage.getItem('mergemate_pending_sign_in')),null);assert.equal(callbackCount,1);
  await page.goto(base+'/inbox');await page.getByText('Private review for one',{exact:true}).waitFor();
  const other=await context.newPage();other.setDefaultTimeout(15000);other.on('pageerror',error=>errors.push(error.message));await page.waitForTimeout(200);maxRefresh=0;refreshDelay=120;
  await Promise.all([page.goto(base+'/inbox'),other.goto(base+'/inbox')]);await Promise.all([page.getByText('Private review for one',{exact:true}).waitFor(),other.getByText('Private review for one',{exact:true}).waitFor()]);await page.waitForTimeout(300);assert.equal(maxRefresh,1);
  await other.getByRole('button',{name:'Play Inbox overview',exact:true}).click();await other.getByText('Reading with a local device voice.',{exact:true}).waitFor();const beforeSwitch=await other.evaluate(()=>window.__speech.cancelled);
  nextAccount='two';const switched=await start(page);await page.goto(`${base}/auth/callback?code=fixture-code&state=${first}`);await page.waitForURL('**/sign-in');assert.equal(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('mergemate_pending_sign_in')).state),switched);await finish(page,switched);await other.getByText('Private review for two',{exact:true}).waitFor();assert.equal(await other.getByText('Private review for one',{exact:true}).count(),0);assert((await other.evaluate(()=>window.__speech.cancelled))>beforeSwitch);
  await other.getByRole('button',{name:'Play Inbox overview',exact:true}).click();await other.getByText('Reading with a local device voice.',{exact:true}).waitFor();const beforeLogout=await other.evaluate(()=>window.__speech.cancelled);
  await page.goto(base+'/settings');await page.getByRole('button',{name:'Sign Out',exact:true}).click();await page.waitForURL('**/sign-in');await other.waitForURL('**/sign-in');assert((await other.evaluate(()=>window.__speech.cancelled))>beforeLogout);assert.equal(await other.getByText('Private review for two',{exact:true}).count(),0);await page.goBack();await page.waitForTimeout(200);await page.waitForURL('**/sign-in');await page.getByRole('button',{name:'Continue with GitHub',exact:true}).waitFor();assert.equal(await page.getByText('Private review for two',{exact:true}).count(),0);
  nextAccount='one';const again=await start(page);await finish(page,again);offlineLogout=true;await page.goto(base+'/settings');await page.getByRole('button',{name:'Sign Out',exact:true}).click();await page.waitForURL('**/sign-in');assert.equal(await page.evaluate(()=>localStorage.getItem('mergemate_logout_pending')),'1');await page.reload();await page.getByRole('button',{name:'Finish signing out',exact:true}).waitFor();assert.equal(await page.getByText('Private review for one',{exact:true}).count(),0);assert(signedIn,'fixture keeps server cookie alive to test blocked restoration');
  offlineLogout=false;await page.getByRole('button',{name:'Finish signing out',exact:true}).click();await page.getByRole('button',{name:'Continue with GitHub',exact:true}).waitFor();const recovered=await start(page);await finish(page,recovered);assert.equal(await page.evaluate(()=>localStorage.getItem('mergemate_logout_pending')),null);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:`${proof}/recovered-${width}.png`,fullPage:true});assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS: real app PKCE/cancel/replay/restore, authoritative demo status, two-tab refresh serialization/account switch/logout with active readout cancellation/Back and offline logout reload/recovery at393/1440. GitHub/API transports mocked; screenshots: '+proof);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
