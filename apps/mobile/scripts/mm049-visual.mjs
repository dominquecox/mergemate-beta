import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

// Review harness only. Runs the real exported app against isolated API fixtures.
const root=resolve(fileURLToPath(new URL('../dist',import.meta.url)));
const output=resolve(fileURLToPath(new URL('file:///private/tmp/mm049-proof/')));
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.ttf':'font/ttf','.woff2':'font/woff2','.png':'image/png','.ico':'image/x-icon'};
const server=createServer(async(req,res)=>{
  const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(path!==root && !path.startsWith(root+'/')){res.writeHead(404);res.end();return;}
  try{const content=await readFile(extname(path)?path:resolve(root,'index.html'));res.writeHead(200,{'content-type':mime[extname(path)]??'text/html'});res.end(content);}
  catch{res.writeHead(404);res.end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const address=server.address();
if(!address || typeof address==='string')throw new Error('No local server address');
const origin=`http://127.0.0.1:${address.port}`;
const user={id:'review-fixture',login:'octocat',name:'Demo Developer',avatarUrl:'https://example.com/avatar.png'};
const at='2026-10-27T12:00:00.000Z';
const coverage={analyzedFiles:4,skippedFiles:0,truncatedFiles:0};
const summary={whatChanged:'Adds bounded retries for offline requests and preserves a clear connection state.',whyItMatters:'People can recover from a brief network interruption without losing their place.',suggestedFocus:['Review retry limits and cancellation.','Check the offline-to-online transition.'],coverage};
const titles=['Add bounded retries for offline requests','Rotate access tokens safely during sign-in','Improve empty states in the review inbox','Update notification delivery preferences','Keep repository access checks scoped to the user','Make loading states easier to understand'];
const items=Array.from({length:200},(_,i)=>({id:`fixture-${i}`,kind:['review','review','mention','mine','review','mine'][i%6],repo:'octocat/review-app',number:1429+i,title:`Review pull request ${i+1}`,author:['janedoe','alexchen','sarahdev'][i%3],status:'open',risk:['low','high','low','medium','high','low'][i%6],summaryLine:['Bounded retries, clear recovery states, and cancellation tests.','Review the authentication boundary and token rotation path.','A calmer experience when there is nothing left to review.'][i%3],updatedAt:at,read:i>2}));
const settings={notifications:{review:true,mention:true,mine:true},quietHours:null,aiSummaries:true};
const detail={repo:'octocat/review-app',number:1429,title:titles[0],body:'A small improvement to request recovery.',author:'janedoe',status:'open',baseBranch:'main',headBranch:'feature/bounded-retries',headSha:'abcdef1234',additions:142,deletions:38,changedFiles:4,files:[{path:'src/network/retry.ts',status:'modified',additions:82,deletions:20,patch:'@@ -1,2 +1,3 @@\n-return request();\n+return retry(request, { attempts: 3 });'}],checks:[{name:'Typecheck',state:'success'},{name:'Unit tests',state:'success'}],threads:[],createdAt:at,updatedAt:at,htmlUrl:'https://github.com/octocat/review-app/pull/1429'};
const notificationMode='normal';
const authenticated=true;
const delayMe=false;
const apiCalls=[];
const results=[];
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  await mkdir(output,{recursive:true});
  for(const width of (process.env.MM049_FOCUS?[393]:[393,1440]))for(const theme of (process.env.MM049_FOCUS?['dark']:['dark','light'])){
    const context=await browser.newContext({viewport:{width,height:width===393?1000:1050},deviceScaleFactor:1,colorScheme:theme,timezoneId:'America/Indiana/Indianapolis'});
    await context.addInitScript((theme)=>{localStorage.setItem('mergemate_demo_session','true');localStorage.setItem('mergemate_theme',theme);},theme);
    const page=await context.newPage();page.setDefaultTimeout(15000);const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error' && !/status of (401|502)/.test(message.text()))errors.push(message.text());});
    await page.route('**/*',async route=>{
      const request=route.request();const url=new URL(request.url());
      if(url.origin===origin || url.protocol==='data:')return route.continue();
      if(url.origin!=='https://api-mm049.example')return route.abort();
      apiCalls.push({method:request.method(),path:url.pathname+url.search});
      const headers={'content-type':'application/json','access-control-allow-origin':origin,'access-control-allow-credentials':'true','access-control-allow-headers':'content-type,x-csrf-token,authorization','access-control-allow-methods':'GET,POST,PUT,DELETE,OPTIONS'};
      if(request.method()==='OPTIONS')return route.fulfill({status:204,headers,body:''});
      const path=url.pathname.replace('/v1','');let body;let status=200;
      if(path==='/me'){if(delayMe)await new Promise(resolve=>setTimeout(resolve,2000));if(authenticated)body=user;else{status=401;body={error:{code:'unauthorized',message:'Sign in.',requestId:'fixture'}};}}
      else if(path==='/notifications'){
        const filter=url.searchParams.get('filter');const kinds={review:'review',mentions:'mention',mine:'mine'};
        const found=items.filter(item=>(!kinds[filter] || item.kind===kinds[filter]) && item.title.toLowerCase().includes((url.searchParams.get('search')??'').toLowerCase()));const start=(Number(url.searchParams.get('cursor')??1)-1)*50;body={items:found.slice(start,start+50),nextCursor:start+50<found.length?String(start/50+2):null};
        if(notificationMode==='error'){status=502;body={error:{code:'upstream_unavailable',message:'Fixture service unavailable.',requestId:'fixture'}};}
      }
      else if(path==='/auth/csrf')body={csrfToken:'fixture-csrf'};
      else if(path==='/auth/refresh')body={session:{expiresAt:'2026-11-26T12:00:00.000Z',demo:true}};
      else if(path==='/consent')body={ai:{granted:true,version:'1',at}};
      else if(path==='/settings')body=settings;
      else if(path==='/settings/meta-key')body={configured:false};
      else if(path==='/billing/plan')body={plan:'free',status:'active',renewsAt:null,cancelAt:null};
      else if(path==='/triage')body=items.slice(0,3).map(item=>({prRef:`${item.repo}#${item.number}`,title:item.title,lane:'needs_you',reason:'A review request is waiting for you.'}));
      else if(path==='/repos'){const start=Number(url.searchParams.get('cursor')??0);body={items:Array.from({length:50},(_,i)=>({id:`repo-${start+i}`,fullName:`octocat/repo-${start+i+1}`,private:false,watching:true})),nextCursor:start<150?String(start+50):null};}
      else if(path==='/me/installations')body={items:[],installUrl:'https://github.com/apps/example/installations/new'};
      else if(path==='/public/posts')body={items:[{slug:'review-workspace',type:url.searchParams.get('type')??'news',title:'A calmer review workspace',excerpt:'A focused review experience.',body:'A focused review workspace with clear risk labels and read-only GitHub access.',publishedAt:at}],nextCursor:null};
      else if(path.endsWith('/summary'))body=summary;
      else if(path.endsWith('/risk'))body={level:'medium',reasons:['Touches request retry behavior.','Check the cancellation tests.'],coverage};
      else if(path.endsWith('/pages/files'))body={items:detail.files,nextCursor:null};
      else if(path.endsWith('/pages/comments'))body={items:[{id:'conversation',path:null,line:null,comments:[{id:'c1',author:'reviewer',body:'Fixture review comment.',createdAt:at}]}],nextCursor:null};
      else if(path.startsWith('/prs/'))body={...detail,files:[],threads:[],mergeState:'clean'};
      else if(path.startsWith('/triage/'))body={prRef:decodeURIComponent(path.slice(8)),lane:JSON.parse(request.postData()??'{}').lane};
      else if(/^\/notifications\/.+\/(done|snooze|restore)$/.test(path))return route.fulfill({status:204,headers,body:''});
      else if(path.endsWith('/activity'))body={items:[],nextCursor:at};
      else {status=404;body={error:{code:'not_found',message:'Unknown fixture endpoint.',requestId:'fixture'}};}
      return route.fulfill({status,headers,body:JSON.stringify(body)});
    });

    async function snap(label){
      await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(150);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),label+' overflow');
      await page.screenshot({path:resolve(output,`${label}-${width}-${theme}.png`)});
      results.push({label,width,theme});
    }
    await page.goto(origin+'/inbox');
    await page.getByRole('button',{name:/Open pull request #1429:/}).waitFor();
    await snap('inbox');
    for(let scroll=0;scroll<80;scroll++){
      await page.evaluate(()=>{for(const el of document.querySelectorAll('*'))if(el.scrollHeight>el.clientHeight+100 && /auto|scroll/.test(getComputedStyle(el).overflowY))el.scrollTop+=4000;});
      await page.waitForTimeout(60);
      if(await page.getByRole('button',{name:/Open pull request #1628:/}).isVisible())break;
    }
    assert.ok(await page.getByRole('button',{name:/Open pull request #1628:/}).isVisible(),'reached item 200');
    assert.ok(await page.getByRole('button',{name:/Open pull request #/}).count()<100,'virtualized mounted rows');
    await page.getByRole('button',{name:/Open pull request #1628:/}).scrollIntoViewIfNeeded();
    await snap('inbox-200');
    await page.goto(origin+'/inbox');await page.getByRole('button',{name:'Mark Review pull request 1 as done',exact:true}).waitFor();
    const doneStart=apiCalls.filter(c=>c.path.endsWith('/done')).length;
    await page.getByRole('button',{name:'Mark Review pull request 1 as done',exact:true}).evaluate(el=>{for(let n=0;n<10;n++)el.click();});
    await page.getByText('Moved out of your inbox',{exact:true}).waitFor();await page.waitForTimeout(200);
    assert.equal(apiCalls.filter(c=>c.path.endsWith('/done')).length-doneStart,1,'ten Done taps = one write');
    await page.getByRole('button',{name:/Open pull request #1430:/}).click();
    await page.getByText('AI Summary',{exact:true}).waitFor();await snap('pr-detail');
    await page.getByRole('button',{name:'Load files',exact:true}).click();
    await page.getByRole('button',{name:'Toggle diff for src/network/retry.ts',exact:true}).click();
    await page.getByRole('button',{name:'Load comments',exact:true}).click();
    await page.getByText('Fixture review comment.',{exact:true}).waitFor();await snap('pr-pages');
    const inboxReads=apiCalls.filter(c=>c.path==='/v1/notifications?filter=all').length;
    await page.goBack();await page.getByRole('button',{name:/Open pull request #1430:/}).waitFor();
    assert.equal(apiCalls.filter(c=>c.path==='/v1/notifications?filter=all').length,inboxReads,'Back reuses inbox');
    await page.goto(origin+'/triage');
    const card=page.getByRole('button',{name:'Open pull request Review pull request 1',exact:true});await card.waitFor();await card.click();
    await page.getByText('AI Summary',{exact:true}).waitFor();await page.goBack();await card.waitFor();
    const choices=apiCalls.filter(c=>c.method==='POST' && c.path.startsWith('/v1/triage/')).length;
    await page.getByRole('button',{name:'Needs you',exact:true}).evaluate(el=>{for(let n=0;n<10;n++)el.click();});
    await page.getByRole('button',{name:'Open pull request Review pull request 2',exact:true}).waitFor();
    assert.equal(apiCalls.filter(c=>c.method==='POST' && c.path.startsWith('/v1/triage/')).length-choices,1,'ten choices = one write');
    await snap('triage');
    await page.goto(origin+'/search');await page.getByRole('textbox').first().waitFor();
    await page.getByRole('textbox').first().pressSequentially('Review pull request 200',{delay:10});
    await page.getByRole('button',{name:'Open pull request Review pull request 200 in octocat/review-app',exact:true}).waitFor();
    assert.equal(apiCalls.filter(c=>c.path.includes('search=')).length,1,'debounced search sends one request');await snap('search');
    await page.goto(origin+'/notifications');await page.getByRole('button',{name:'Review Review pull request 1',exact:true}).waitFor();await snap('activity');
    await page.getByRole('button',{name:'Review Review pull request 1',exact:true}).click();try{await page.getByText('AI Summary',{exact:true}).waitFor();}catch(error){await page.screenshot({path:resolve(output,'failure.png')});await writeFile(resolve(output,'failure.json'),JSON.stringify({url:page.url(),errors,apiCalls,body:await page.locator('body').innerText()},null,2));throw error;}
    await page.goto(origin+'/repos');await page.getByRole('switch',{name:'Stop watching octocat/repo-1',exact:true}).waitFor();await snap('repos');
    assert.deepEqual(errors,[],`${width}/${theme} runtime errors`);
    if(width===393 && theme==='dark'){
      const evidence=await context.newPage();await evidence.setContent(`<html><body style="background:#11121a;color:#e6e7ed;font:14px monospace;padding:24px"><h1>Recorded browser requests</h1><p>Isolated API fixtures · no live provider calls</p><p>10 rapid Done taps → 1 POST · 10 triage taps → 1 POST</p><p>200 inbox items reached; mounted rows &lt; 100 · Back reused inbox</p><table>${apiCalls.slice(-30).map(c=>`<tr><td style="padding:6px">${c.method}</td><td>${c.path}</td></tr>`).join('')}</table></body></html>`);await evidence.setViewportSize({width:1100,height:1400});await evidence.screenshot({path:resolve(output,'network-proof.png')});await evidence.close();
    }
    await context.close();apiCalls.length=0;
  }
  await writeFile(resolve(output,'visual-results.json'),JSON.stringify({results,noLiveProviderCalls:true},null,2));
  console.log(JSON.stringify({screenshots:results.length,checks:'200 items, 10-tap writes, Back, lazy pages, debounced search',output}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
