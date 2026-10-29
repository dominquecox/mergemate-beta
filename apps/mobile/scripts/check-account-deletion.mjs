import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../dist'),site=resolve(root,'../../site/public');
const proof='/private/tmp/mergemate-account-deletion';await mkdir(proof,{recursive:true});
const mime=file=>({'.js':'application/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.ttf':'font/ttf'}[extname(file)]??'text/html');
const server=createServer(async(req,res)=>{try{let file=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+sep)&&file!==root){res.writeHead(404).end();return;}let body;try{body=await readFile(file);}catch{file=resolve(root,'index.html');body=await readFile(file);}res.writeHead(200,{'content-type':mime(file)}).end(body);}catch{res.writeHead(500).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
let browser;
try{
 browser=await chromium.launch({headless:true,channel:'chrome'});
 for(const width of [393,1440])for(const scenario of ['recovery','device-error','demo']){
  const context=await browser.newContext({viewport:{width,height:1100},serviceWorkers:'block'});let signedIn=scenario!=='recovery',pending=false,deletes=0,mode=scenario==='device-error'?'success':'failure',release,deletionArrived;let holds=Promise.resolve();const errors=[];
  await context.addInitScript(fail=>{localStorage.setItem('mergemate_recent_searches','["fixture/private-repo"]');localStorage.setItem('mergemate_ai_consent','true');localStorage.setItem('mergemate_theme','dark');if(fail){const remove=Storage.prototype.removeItem;Storage.prototype.removeItem=function(key){if(key==='mergemate_recent_searches'&&!window.__allowCleanup)throw new Error('Fixture device storage denied');return remove.call(this,key);};}},scenario==='device-error');
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());if(url.origin===base||url.protocol==='data:')return route.continue();
   if(url.origin==='https://mergemate.dev'){const file=resolve(site,'.'+url.pathname.replace(/^\/delete-account$/,'/delete-account.html'));if(!file.startsWith(site+sep))return route.abort();try{return route.fulfill({status:200,contentType:mime(file),body:await readFile(file)});}catch{return route.fulfill({status:404,body:'Missing fixture file'});}}
   if(url.origin==='https://app.mergemate.dev'){assert.equal(url.pathname,'/account/delete');assert.equal(request.method(),'GET');return route.fulfill({contentType:'text/html',body:'<title>Authenticated deletion entry</title>'});}
   if(url.origin!=='https://api-dev.mergemate.dev')return route.abort();
   const headers={'content-type':'application/json','access-control-allow-origin':base,'access-control-allow-credentials':'true','access-control-allow-headers':'content-type,x-csrf-token','access-control-allow-methods':'GET,POST,DELETE,PUT,OPTIONS'};
   const reply=(status,body)=>route.fulfill({status,headers,body:status===204?'':JSON.stringify(body)}),fail=(status,code)=>reply(status,{error:{code,message:'Fixture failure',requestId:'fixture'}});
   if(request.method()==='OPTIONS')return reply(204,null);const path=url.pathname.replace('/v1','');
   if(path==='/flags')return reply(200,{voice_readout:false,voice_notes:false,highlight:false});
   if(!signedIn)return fail(401,'unauthorized');
   if(path==='/me')return reply(200,{id:'fixture-user',login:'fixture',name:'Fixture',avatarUrl:base+'/favicon.ico',demo:scenario==='demo',...(pending?{deletionPending:true}:{})});
   if(path==='/auth/csrf')return reply(200,{csrfToken:'fixture-csrf'});
   if(path==='/auth/refresh')return pending?fail(403,'forbidden'):reply(200,{session:{expiresAt:'2099-01-01T00:00:00.000Z',csrfToken:'fixture-csrf'}});
   if(path==='/auth/logout'){signedIn=false;return reply(204,null);}
   if(path==='/account'&&request.method()==='DELETE'){
    deletes++;deletionArrived?.();deletionArrived=undefined;pending=true;if(mode==='failure')return fail(502,'upstream_unavailable');if(mode==='held')await holds;signedIn=false;return reply(204,null);
   }
   if(pending)return fail(403,'forbidden');
   if(path==='/notifications')return reply(200,{items:[],nextCursor:null});
   if(path==='/me/installations')return reply(200,{items:[],installUrl:'https://github.com/apps/fixture/installations/new'});
   return fail(404,'not_found');
  });
  const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>dialog.dismiss());
  if(scenario==='recovery'){
   await page.goto(base+'/account/delete');await page.waitForURL('**/sign-in');assert.equal(deletes,0);signedIn=true;
  }
  await page.goto(base+'/account/delete');
  if(scenario==='demo'){
   await page.getByText('No account to delete in the demo',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Permanently Delete Account',exact:true}).count(),0);assert.equal(deletes,0);await page.screenshot({path:`${proof}/demo-${width}.png`,fullPage:true});
  }else{
   await page.getByRole('heading',{name:'Delete Account',exact:true}).waitFor();await page.getByRole('button',{name:'Permanently Delete Account',exact:true}).click();await page.waitForTimeout(100);assert.equal(deletes,0,'cancelled confirmation must not delete');
   page.removeAllListeners('dialog');page.on('dialog',dialog=>dialog.accept());
   if(scenario==='device-error'){
    const peer=await context.newPage();peer.setDefaultTimeout(15000);await peer.goto(base+'/inbox');await peer.getByRole('heading',{name:'Inbox',exact:true}).waitFor();
    await page.getByRole('button',{name:'Permanently Delete Account',exact:true}).click();await page.waitForURL('**/sign-in');await page.getByText('Account deleted',{exact:true}).waitFor();await peer.waitForURL('**/sign-in');await peer.getByRole('button',{name:'Continue with GitHub',exact:true}).click();await peer.getByText('Account deleted',{exact:true}).waitFor();await page.getByText(/Your account was deleted\. Clear this browser/).waitFor();assert.equal(deletes,1);await page.screenshot({path:`${proof}/device-cleanup-${width}.png`,fullPage:true});assert.equal(await page.getByRole('button',{name:'Continue with GitHub',exact:true}).count(),0);await page.reload();await page.getByText('Account deleted',{exact:true}).waitFor();await page.evaluate(()=>{window.__allowCleanup=true;});await page.getByRole('button',{name:'Clear local data',exact:true}).click();await page.getByRole('button',{name:'Continue with GitHub',exact:true}).waitFor();assert.equal(await page.evaluate(()=>localStorage.getItem('mergemate_recent_searches')),null);assert.equal(deletes,1);
   }else{
    const peer=await context.newPage();peer.setDefaultTimeout(15000);await peer.goto(base+'/inbox');await peer.getByRole('heading',{name:'Inbox',exact:true}).waitFor();
    await page.getByRole('button',{name:'Permanently Delete Account',exact:true}).click();await page.getByRole('button',{name:'Retry deletion',exact:true}).waitFor();assert.equal(deletes,1);await peer.waitForURL('**/account/delete');await peer.getByText(/A previous deletion request is unfinished/).waitFor();assert.equal(await page.evaluate(()=>localStorage.getItem('mergemate_recent_searches')),'["fixture/private-repo"]');await page.screenshot({path:`${proof}/retry-${width}.png`,fullPage:true});
    await peer.goto(base+'/settings');await peer.waitForURL('**/account/delete');assert.equal(await peer.getByRole('heading',{name:'Settings',exact:true}).count(),0);
    mode='held';holds=new Promise(resolve=>{release=resolve;});const arrived=new Promise(resolve=>{deletionArrived=resolve;});await page.getByRole('button',{name:'Retry deletion',exact:true}).click();await page.getByText('Deleting your account...',{exact:true}).waitFor();await arrived;assert.equal(deletes,2);await page.screenshot({path:`${proof}/loading-${width}.png`,fullPage:true});release();await page.waitForURL('**/sign-in');await peer.waitForURL('**/sign-in');
    assert.equal(await page.evaluate(()=>localStorage.getItem('mergemate_recent_searches')),null);assert.equal(await page.evaluate(()=>localStorage.getItem('mergemate_ai_consent')),null);assert.equal(await page.evaluate(()=>localStorage.getItem('mergemate_theme')),'dark');await page.goBack();await page.waitForURL('**/sign-in');assert.equal(await page.getByText('Account: @fixture',{exact:true}).count(),0);assert.equal(deletes,2);
    await page.goto(base+'/delete-account');await page.waitForURL('https://mergemate.dev/delete-account');const entry=page.getByRole('link',{name:'Sign in to your MergeMate account',exact:true});await entry.waitFor();assert.equal(await entry.getAttribute('href'),'https://app.mergemate.dev/account/delete');assert.equal(deletes,2);await page.screenshot({path:`${proof}/public-guide-${width}.png`,fullPage:true});await entry.click();await page.waitForURL('https://app.mergemate.dev/account/delete');assert.equal(deletes,2);
   }
  }
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS: real exported app confirmation cancel/retry/loading, peer pending-account isolation, local erasure/theme preservation, Back, device-cleanup error, demo denial and authenticated public entry at393/1440. API/GitHub/storage failures mocked; screenshots:'+proof);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
