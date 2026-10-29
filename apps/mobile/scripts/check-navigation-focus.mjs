import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../dist');
const proof=process.env.MM_NAV_PROOF_DIR ?? '/private/tmp/mergemate-navigation-focus';
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
  for(const width of [320,393,1440]){
    const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block',reducedMotion:'reduce'});const page=await context.newPage();page.setDefaultTimeout(15000);const errors=[];let signedIn=true;let settingsWrites=0;let watched=true;let watchWrites=0;let preferences={notifications:{review:true,mention:true,mine:false},quietHours:null,aiSummaries:false};
    page.on('pageerror',error=>{errors.push(error.message);console.error('fixture page error:',error.message);});page.on('console',message=>{if(/Blocked aria-hidden|focused.*aria-hidden/i.test(message.text()))errors.push(message.text());});
    await page.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url());if(url.origin===base||url.protocol==='data:')return route.continue();if(url.origin!=='https://api-dev.mergemate.dev')return route.abort();
      const headers={'content-type':'application/json','access-control-allow-origin':base,'access-control-allow-credentials':'true','access-control-allow-headers':'content-type,x-csrf-token','access-control-allow-methods':'GET,POST,PUT,DELETE,OPTIONS'};
      const reply=(status,body)=>route.fulfill({status,headers,body:JSON.stringify(body)});if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});const path=url.pathname.replace('/v1','');
      if(path==='/inbox/preference')return reply(200,{filter:'all'});
   if(path==='/inbox/undo')return reply(200,null);
   if(path==='/me')return reply(signedIn?200:401,signedIn?{id:'fixture-user',login:'fixture',name:'Fixture',avatarUrl:base+'/favicon.ico',demo:false}:{error:{code:'unauthorized',message:'Sign in.',requestId:'fixture'}});
      if(path==='/auth/refresh')return reply(200,{session:{expiresAt:'2099-01-01T00:00:00.000Z'}});
      if(path==='/me/installations')return reply(200,{items:[],installUrl:'https://github.com/apps/mergemate/installations/new'});
      if(path==='/repos')return reply(200,{items:[{id:'fixture-repo',fullName:'fixture/repo',private:true,watching:watched}],nextCursor:null});
      if(path==='/repos/fixture-repo/watch'){watchWrites++;watched=request.postDataJSON().watching;return reply(200,{id:'fixture-repo',fullName:'fixture/repo',watching:watched});}
      if(path==='/search/prs')return reply(200,{items:[],nextCursor:null,candidates:0,incomplete:false,capped:false});
      if(path==='/notifications')return reply(200,{items:[],nextCursor:null});
      if(path==='/auth/csrf')return reply(200,{csrfToken:'local-fixture-csrf'});
      if(path==='/settings'){if(request.method()==='PUT'){settingsWrites++;preferences=request.postDataJSON();await new Promise(resolve=>setTimeout(resolve,100));}return reply(200,preferences);}
      if(path==='/push/web-key')return reply(200,{publicKey:'B'+'A'.repeat(86)});
      if(path==='/billing/plan')return reply(200,{plan:'free',status:'active',renewsAt:null,cancelAt:null});
      if(path==='/consent')return reply(200,{ai:{granted:false,version:null,at:null}});
      return reply(404,{error:{code:'not_found',message:'Unavailable',requestId:'fixture'}});
    });
    const heading=async name=>{const h=page.getByRole('heading',{name,exact:true});await h.waitFor().catch(async error=>{console.error('fixture route:',page.url(),'body:',(await page.locator('body').innerText()).slice(0,1500));await page.screenshot({path:`${proof}/failure-${width}.png`});throw error;});await page.waitForFunction(label=>document.activeElement?.textContent===label,name);assert.equal(await h.getAttribute('tabindex'),'-1');};
    async function keyboardActivate(locator){await locator.focus();await page.keyboard.press('Enter');}
    await page.goto(base+'/inbox');await heading('Inbox');
    const search=page.getByRole('button',{name:'Search pull requests',exact:true}).last();await keyboardActivate(search);await heading('Search & Filters');
    await keyboardActivate(page.getByRole('button',{name:'Go back',exact:true}));await heading('Inbox');
    await keyboardActivate(page.getByRole(width===1440?'link':'tab',{name:width===1440?'Settings':'Settings tab',exact:true}));await heading('Settings');
    await page.getByText('Delete Account & Revoke Access',{exact:true}).waitFor();await keyboardActivate(page.getByRole('button',{name:'Delete Account & Revoke Access',exact:true}));await heading('Delete Account');
    await keyboardActivate(page.getByRole('button',{name:'Cancel',exact:true}));await heading('Settings');
    const toggle=page.getByRole('switch',{name:'Review requests',exact:true});
    for(const control of await page.getByRole('switch').all()){const box=await control.boundingBox();assert(box && box.width>=44 && box.height>=44,'actual switch target must be44x44');}
    await toggle.scrollIntoViewIfNeeded();
    const box=await toggle.boundingBox();await page.mouse.click(box.x+box.width/2,box.y+4);await toggle.focus();await page.keyboard.press('Space');
    await page.waitForFunction(()=>document.querySelector('[role=switch][aria-label="Review requests"]')?.getAttribute('aria-checked')==='false');await page.waitForFunction(()=>document.querySelector('[role=switch][aria-label="Review requests"]')?.getAttribute('aria-disabled')==='false');assert.equal(settingsWrites,1);
    await toggle.focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>document.querySelector('[role=switch][aria-label="Review requests"]')?.getAttribute('aria-checked')==='true');await page.waitForFunction(()=>document.querySelector('[role=switch][aria-label="Review requests"]')?.getAttribute('aria-disabled')==='false');assert.equal(settingsWrites,2);
    assert(await toggle.evaluate(el=>el===document.activeElement));await page.keyboard.press('Space');await page.waitForFunction(()=>document.querySelector('[role=switch][aria-label="Review requests"]')?.getAttribute('aria-checked')==='false');await page.waitForFunction(()=>document.querySelector('[role=switch][aria-label="Review requests"]')?.getAttribute('aria-disabled')==='false');assert.equal(settingsWrites,3);
    await toggle.focus();assert.equal(await toggle.evaluate(el=>el===document.activeElement),true);
    assert.equal(await toggle.evaluate(el=>getComputedStyle(el).outlineStyle),'solid');
    await page.addStyleTag({content:'[role=heading]{font-size:2em!important;line-height:1.4!important}'});
    await page.screenshot({path:`${proof}/settings-focus-${width}.png`,fullPage:true});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.goto(base+'/repos');await heading('Repositories');const watch=page.getByRole('switch',{name:'Stop watching fixture/repo',exact:true});await watch.waitFor();await watch.scrollIntoViewIfNeeded();const watchBox=await watch.boundingBox();assert(watchBox.width>=44&&watchBox.height>=44);await watch.focus();await page.keyboard.press('Space');await page.getByRole('switch',{name:'Watch fixture/repo',exact:true}).waitFor();assert.equal(watchWrites,1);
    signedIn=false;await page.goto(base+'/settings');await page.waitForURL(/sign-in/);await heading('Connect your GitHub');assert.equal(await page.getByRole('button',{name:'Delete Account & Revoke Access',exact:true}).count(),0);
    assert.deepEqual(errors,[]);await context.close();
  }
  console.log('PASS: keyboard-only search/Back/tab/modal/Cancel focus, no aria-hidden focus warning, no focus stealing on same screen and signed-out route protection at320/393/1440 including enlarged heading layout and real44px targets with edge click/Enter/Space single writes. Screenshots: '+proof);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
