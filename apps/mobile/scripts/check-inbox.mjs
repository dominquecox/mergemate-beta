import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {dirname,extname,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../dist'),proof='/private/tmp/mergemate-inbox';await mkdir(proof,{recursive:true});
const server=createServer(async(req,res)=>{try{let file=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+sep)&&file!==root){res.writeHead(404).end();return;}let body;try{body=await readFile(file);}catch{file=resolve(root,'index.html');body=await readFile(file);}res.writeHead(200,{'content-type':{'.js':'application/javascript','.css':'text/css','.png':'image/png','.ttf':'font/ttf','.ico':'image/x-icon'}[extname(file)]??'text/html'}).end(body);}catch{res.writeHead(500).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;let browser;
const rows=Array.from({length:120},(_,i)=>({id:Buffer.from(`fixture/repo#${i+1}`).toString('base64url'),kind:['review','mention','mine'][i%3],repo:'fixture/repo',number:i+1,title:`Review item ${i+1}`,author:'fixture',status:'open',updatedAt:new Date(Date.parse('2026-10-27T12:00:00Z')-i*60000).toISOString(),read:false}));
try{
 browser=await chromium.launch({headless:true,channel:'chrome'});
 for(const width of [393,1440])for(const mode of ['main','initial-error','cursor-empty','demo']){
  const context=await browser.newContext({viewport:{width,height:1050},serviceWorkers:'block'});let owner='account-a',serverNow=Date.now(),initialFailure=mode==='initial-error',writeFailure=mode==='main',undoFailure=mode==='main',holdNext=false,releaseHeld;
  const states=new Map(),preferences=new Map([['account-a','all']]);let stateCalls=0,aiCalls=0;const bodies=[];
  await context.addInitScript(()=>{const original=Date.now;window.__inboxOffset=0;Date.now=()=>original()+window.__inboxOffset;});
  const page=await context.newPage();page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const ownRows=()=>owner==='account-a'?rows:[{...rows[0],id:'other-item',title:'Other account item',number:999}];
  const allVisible=filter=>ownRows().filter(row=>{const state=states.get(`${owner}:${row.id}`);return (filter==='all'||row.kind===({review:'review',mentions:'mention',mine:'mine'})[filter])&&(!state?.doneAt||Date.parse(row.updatedAt)>Date.parse(state.doneAt))&&(!state?.snoozedUntil||Date.parse(state.snoozedUntil)<=serverNow);}).map(row=>({...row,stateToken:states.get(`${owner}:${row.id}`)?.operationId??null}));
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());if(url.origin===base||url.protocol==='data:')return route.continue();if(url.origin!=='https://api-dev.mergemate.dev')return route.abort();
   const headers={'content-type':'application/json','access-control-allow-origin':base,'access-control-allow-credentials':'true','access-control-allow-headers':'content-type,x-csrf-token','access-control-allow-methods':'GET,POST,PUT,DELETE,OPTIONS'};
   const reply=async(status,body)=>{try{await route.fulfill({status,headers,body:status===204?undefined:JSON.stringify(body)});}catch{/* A discarded account fixture may no longer have a response consumer. */}};
   if(req.method()==='OPTIONS')return reply(204);const path=url.pathname.replace('/v1',''),current=owner;
   if(path==='/flags')return reply(200,{voice_readout:false,voice_notes:false,highlight:false});
   if(path==='/me')return reply(200,{id:owner,login:owner,name:owner==='account-a'?'Account A':'Account B',avatarUrl:base+'/favicon.ico',demo:mode==='demo'});
   if(path==='/auth/refresh')return reply(200,{session:{expiresAt:'2099-01-01T00:00:00.000Z',csrfToken:'fixture-csrf',demo:mode==='demo'}});
   if(path==='/auth/csrf')return reply(200,{csrfToken:'fixture-csrf'});
   if(path==='/consent')return reply(200,{ai:{granted:true,version:'1'}});
   if(path==='/push/web-key')return reply(200,{publicKey:null});
   if(path==='/inbox/preference'){if(req.method()==='PUT')preferences.set(owner,req.postDataJSON().filter);return reply(200,{filter:preferences.get(owner)??'all'});}
   if(path==='/inbox/undo'){const candidates=[...states].filter(([key,value])=>key.startsWith(owner+':')&&(value.doneAt||(value.snoozedUntil&&Date.parse(value.snoozedUntil)>serverNow))).sort((a,b)=>b[1].updatedAt.localeCompare(a[1].updatedAt));return reply(200,candidates.length?{itemId:candidates[0][0].slice(owner.length+1),receipt:candidates[0][1]}:null);}
   if(path==='/notifications'){
    if(initialFailure){initialFailure=false;return reply(502,{error:{code:'upstream_unavailable',message:'Fixture failure',requestId:'fixture'}});}
    const filter=url.searchParams.get('filter')??'all',offset=Number((url.searchParams.get('cursor')??'p0').slice(1)),visible=allVisible(filter);
    const selected=mode==='cursor-empty'&&offset===0?[]:visible.slice(offset,offset+10);return reply(200,{items:selected,nextCursor:offset+10<visible.length?`p${offset+10}`:null,serverTime:new Date(serverNow).toISOString(),refreshAt:[...states].filter(([key])=>key.startsWith(owner+':')).map(([,state])=>state.snoozedUntil).filter(value=>value&&Date.parse(value)>serverNow).sort()[0]??null});
   }
   if(path.match(/^\/notifications\/[^/]+\/state$/)){
    stateCalls++;const input=req.postDataJSON(),id=decodeURIComponent(path.split('/')[2]),key=`${current}:${id}`,old=states.get(key);bodies.push(input);
    if(writeFailure){writeFailure=false;return reply(502,{error:{code:'upstream_unavailable',message:'Fixture write failure',requestId:'fixture'}});}
    if(input.action==='restore'&&undoFailure){undoFailure=false;return reply(502,{error:{code:'upstream_unavailable',message:'Fixture Undo failure',requestId:'fixture'}});}
    if(old?.operationId===input.operationId)return reply(200,old);
    if((old?.operationId??null)!==input.expectedOperationId)return reply(409,{error:{code:'state_conflict',message:'Changed on another device',requestId:'fixture'}});
    const receipt={operationId:input.operationId,doneAt:input.action==='done'?input.observedUpdatedAt:null,snoozedUntil:input.action==='snooze'?new Date(serverNow+input.durationMinutes*60000).toISOString():null,updatedAt:new Date(serverNow++).toISOString()};states.set(key,receipt);
    if(holdNext){holdNext=false;await new Promise(resolve=>{releaseHeld=resolve;});}
    return reply(200,receipt);
   }
   if(path.match(/^\/prs\/fixture\/repo\/\d+$/)){const number=Number(path.split('/').at(-1));return reply(200,{repo:'fixture/repo',number,title:`Review item ${number}`,body:'Private fixture review',author:'fixture',status:'open',baseBranch:'main',headBranch:'feature',headSha:'abc123',additions:1,deletions:0,changedFiles:0,files:[],checks:[],threads:[],createdAt:'2026-10-27T10:00:00Z',updatedAt:'2026-10-27T12:00:00Z',htmlUrl:`https://github.com/fixture/repo/pull/${number}`});}
   if(path.endsWith('/summary')||path.endsWith('/risk')){aiCalls++;return reply(503,{error:{code:'upstream_unavailable',message:'Fixture AI unavailable',requestId:'fixture'}});}
   return reply(404,{error:{code:'not_found',message:'Unavailable',requestId:'fixture'}});
  });
  await page.goto(base+'/inbox');await page.getByRole('heading',{name:'Inbox',exact:true}).waitFor();
  const open=number=>page.getByRole('button',{name:new RegExp(`^Open pull request #${number}:`)}),done=number=>page.getByRole('button',{name:`Mark Review item ${number} as done`,exact:true});
  if(mode==='initial-error'){await page.getByText('Could not load your inbox',{exact:true}).waitFor();await page.screenshot({path:`${proof}/error-${width}.png`,fullPage:true});await page.getByRole('button',{name:/^Try again$/i}).click();await open(1).waitFor();}
  else if(mode==='cursor-empty'){await page.getByText('Inbox Zero',{exact:true}).waitFor();await page.getByRole('button',{name:'Load more pull requests',exact:true}).click();await open(11).waitFor();}
  else if(mode==='demo'){await open(1).waitFor();assert(await done(1).isDisabled());assert.equal(stateCalls,0);}
  else{
   await open(1).waitFor();assert.equal(aiCalls,0);
   for(const [name,first] of [['Needs review',1],['Mentions',2],['Mine',3],['All',1]]){await page.getByRole('tab',{name:`${name} pull requests`,exact:true}).click();await open(first).waitFor();}
   const saved=page.waitForResponse(response=>response.url().endsWith('/v1/inbox/preference')&&response.request().method()==='PUT');await page.getByRole('tab',{name:'Mentions pull requests',exact:true}).click();await saved;assert.equal(preferences.get(owner),'mentions');await open(2).waitFor();await page.reload();await page.getByRole('tab',{name:'Mentions pull requests',exact:true,selected:true}).waitFor();await open(2).waitFor();await page.getByRole('tab',{name:'All pull requests',exact:true}).click();await open(1).waitFor();
   await done(1).evaluate(el=>{el.click();el.click();});await page.getByRole('alert').waitFor();await open(1).waitFor();assert.equal(stateCalls,1);
   await done(1).click();await page.getByRole('button',{name:'Undo moving Review item 1',exact:true}).waitFor();assert.equal(bodies[0].operationId,bodies[1].operationId);assert.equal(await open(1).count(),0);await page.screenshot({path:`${proof}/done-${width}.png`,fullPage:true});
   const undo=page.getByRole('button',{name:'Undo moving Review item 1',exact:true});await undo.click();await page.getByRole('alert').waitFor();assert.equal(await open(1).count(),0);await undo.click();await open(1).waitFor();assert.equal(bodies[2].operationId,bodies[3].operationId);
   await done(1).click();await page.getByRole('button',{name:'Undo moving Review item 1',exact:true}).waitFor();await page.reload();await page.getByRole('button',{name:'Undo last Inbox change',exact:true}).click();await open(1).waitFor();
   await page.getByRole('button',{name:'Snooze Review item 2',exact:true}).click();await page.getByRole('button',{name:'Undo moving Review item 2',exact:true}).waitFor();await page.reload();await open(1).waitFor();assert.equal(await open(2).count(),0);serverNow+=86400001;await page.evaluate(()=>{window.__inboxOffset+=86400001;});await page.getByRole('button',{name:'Refresh Inbox',exact:true}).first().click();await open(2).waitFor();
   for(let i=0;i<4;i++)await page.evaluate(()=>{const list=[...document.querySelectorAll('div')].find(el=>getComputedStyle(el).overflowY==='auto'&&el.scrollHeight>el.clientHeight+100);if(list){list.scrollTop=list.scrollHeight;list.dispatchEvent(new Event('scroll'));}}).then(()=>page.waitForTimeout(150));
   await open(35).scrollIntoViewIfNeeded();assert.equal(aiCalls,0);await page.screenshot({path:`${proof}/long-list-${width}.png`,fullPage:true});await open(35).click();await page.getByRole('heading',{name:'PR Review Detail',exact:true}).waitFor();await page.getByRole('button',{name:'Go back',exact:true}).click();await open(35).waitFor();const box=await open(35).boundingBox();assert(box&&box.y>=0&&box.y<1050,'Back preserves the long-list anchor');
   await done(35).scrollIntoViewIfNeeded();holdNext=true;await done(35).click();await page.waitForFunction(()=>document.body.innerText.includes('Saving Inbox change'));owner='account-b';const me=page.waitForResponse(response=>response.url().endsWith('/v1/me'));await page.evaluate(()=>{const peer=new BroadcastChannel('mergemate-session-v1');peer.postMessage({v:1,kind:'signed-in'});peer.close();});await me;await page.getByText('Other account item',{exact:true}).waitFor();releaseHeld?.();assert.equal(await page.getByText('Review item 35',{exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Undo moving Review item 35',exact:true}).count(),0);
  }
  assert.deepEqual(errors,[]);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:`${proof}/${mode}-${width}.png`,fullPage:true});await context.close();
 }
 console.log('PASS Inbox browser:8 phone/desktop scenarios, filters and reload preference, optimistic failure/dedup, conditional Undo/retry/reload, snooze expiry, cursor-empty recovery, long-list PR/Back, account switch and demo. External API/GitHub responses mocked.');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
