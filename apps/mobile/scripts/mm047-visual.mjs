import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

// Review harness only. Runs the real exported app against isolated API fixtures.
const root=resolve(fileURLToPath(new URL('../dist',import.meta.url)));
const output=resolve(fileURLToPath(new URL('file:///private/tmp/mm047-proof/')));
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
const items=titles.map((title,i)=>({id:`fixture-${i}`,kind:['review','review','mention','mine','review','mine'][i],repo:i%2?'octocat/auth-service':'octocat/review-app',number:1429+i,title,author:['janedoe','alexchen','sarahdev'][i%3],status:'open',risk:['low','high','low','medium','high','low'][i],summaryLine:['Bounded retries, clear recovery states, and cancellation tests.','Review the authentication boundary and token rotation path.','A calmer experience when there is nothing left to review.'][i%3],updatedAt:at,read:i>2}));
const settings={notifications:{review:true,mention:true,mine:true},quietHours:null,aiSummaries:true};
const detail={repo:'octocat/review-app',number:1429,title:titles[0],body:'A small improvement to request recovery.',author:'janedoe',status:'open',baseBranch:'main',headBranch:'feature/bounded-retries',headSha:'abcdef1234',additions:142,deletions:38,changedFiles:4,files:[{path:'src/network/retry.ts',status:'modified',additions:82,deletions:20,patch:'@@ -1,2 +1,3 @@\n-return request();\n+return retry(request, { attempts: 3 });'}],checks:[{name:'Typecheck',state:'success'},{name:'Unit tests',state:'success'}],threads:[],createdAt:at,updatedAt:at,htmlUrl:'https://github.com/octocat/review-app/pull/1429'};
let notificationMode='normal';
let authenticated=true;
let delayMe=false;
const apiCalls=[];
const results=[];
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  await mkdir(output,{recursive:true});
  for(const width of [393,1440])for(const theme of ['dark','light']){
    const context=await browser.newContext({viewport:{width,height:width===393?1000:1050},deviceScaleFactor:1,colorScheme:theme,timezoneId:'America/Indiana/Indianapolis'});
    await context.addInitScript((theme)=>{localStorage.setItem('mergemate_demo_session','true');localStorage.setItem('mergemate_theme',theme);},theme);
    const page=await context.newPage();page.setDefaultTimeout(15000);const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error' && !/status of (401|502)/.test(message.text()))errors.push(message.text());});
    await page.route('**/*',async route=>{
      const request=route.request();const url=new URL(request.url());
      if(url.origin===origin || url.protocol==='data:')return route.continue();
      if(url.origin!=='https://api-mm047.example')return route.abort();
      apiCalls.push({method:request.method(),path:url.pathname});
      const headers={'content-type':'application/json','access-control-allow-origin':origin,'access-control-allow-credentials':'true','access-control-allow-headers':'content-type,x-csrf-token,authorization','access-control-allow-methods':'GET,POST,PUT,DELETE,OPTIONS'};
      if(request.method()==='OPTIONS')return route.fulfill({status:204,headers,body:''});
      const path=url.pathname.replace('/v1','');let body;let status=200;
      if(path==='/me'){if(delayMe)await new Promise(resolve=>setTimeout(resolve,2000));if(authenticated)body=user;else{status=401;body={error:{code:'unauthorized',message:'Sign in.',requestId:'fixture'}};}}
      else if(path==='/notifications'){
        const filter=url.searchParams.get('filter');const kinds={review:'review',mentions:'mention',mine:'mine'};
        body={items:notificationMode==='empty'?[]:items.filter(item=>!kinds[filter] || item.kind===kinds[filter]),nextCursor:null};
        if(notificationMode==='error'){status=502;body={error:{code:'upstream_unavailable',message:'Fixture service unavailable.',requestId:'fixture'}};}
      }
      else if(path==='/auth/csrf')body={csrfToken:'fixture-csrf'};
      else if(path==='/auth/refresh')body={session:{expiresAt:'2026-11-26T12:00:00.000Z',demo:true}};
      else if(path==='/consent')body={ai:{granted:true,version:'1',at}};
      else if(path==='/settings')body=settings;
      else if(path==='/settings/meta-key')body={configured:false};
      else if(path==='/billing/plan')body={plan:'free',status:'active',renewsAt:null,cancelAt:null};
      else if(path==='/triage')body=items.slice(0,3).map(item=>({prRef:`${item.repo}#${item.number}`,title:item.title,lane:'needs_you',reason:'A review request is waiting for you.'}));
      else if(path==='/repos')body={items:[{id:'repo-1',fullName:'octocat/review-app',private:false,watching:true}],nextCursor:null};
      else if(path==='/me/installations')body={items:[],installUrl:'https://github.com/apps/example/installations/new'};
      else if(path==='/public/posts')body={items:[{slug:'review-workspace',type:url.searchParams.get('type')??'news',title:'A calmer review workspace',excerpt:'A focused review experience.',body:'A focused review workspace with clear risk labels and read-only GitHub access.',publishedAt:at}],nextCursor:null};
      else if(path.endsWith('/summary'))body=summary;
      else if(path.endsWith('/risk'))body={level:'medium',reasons:['Touches request retry behavior.','Check the cancellation tests.'],coverage};
      else if(path.startsWith('/prs/'))body=detail;
      else if(path.endsWith('/activity'))body={items:[],nextCursor:at};
      else {status=404;body={error:{code:'not_found',message:'Unknown fixture endpoint.',requestId:'fixture'}};}
      return route.fulfill({status,headers,body:JSON.stringify(body)});
    });

    async function capture(label,path,ready){
      await page.goto(origin+path);
      if(ready)await page.getByText(ready,{exact:true}).filter({visible:true}).first().waitFor();
      if(label==='triage')await page.getByText('All CI green',{exact:true}).waitFor();
      await page.evaluate(()=>document.fonts.ready);
      await page.waitForTimeout(250);
      const dimensions=await page.evaluate(()=>({headers:[...document.querySelectorAll('[role="heading"]')].filter(el=>el.getBoundingClientRect().width>0).map(el=>el.textContent),width:innerWidth,scroll:document.documentElement.scrollWidth,background:getComputedStyle(document.querySelector('#root')).backgroundColor}));
      assert.ok(dimensions.scroll<=width,`${label}: horizontal overflow`);
      assert.equal(await page.getByRole('button',{name:/^(merge pull request|approve|request changes|close pull request)$/i}).count(),0);
      await page.screenshot({path:resolve(output,`${label}-${width}-${theme}.png`)});
      if(label==='search'){
        await page.getByRole('textbox').first().fill('bounded');
        assert.equal(await page.getByRole('button',{name:/Open pull request /}).count(),1);
        await page.getByRole('tab',{name:'Filter by high risk',exact:true}).click();
        await page.getByText('No matching pull requests',{exact:true}).waitFor();
      }
      if(label==='settings'){
        await page.getByRole('button',{name:'Delete Account & Revoke Access',exact:true}).scrollIntoViewIfNeeded();
        await page.screenshot({path:resolve(output,`settings-lower-${width}-${theme}.png`)});
      }
      if(label==='pr-detail'){
        const assessment=page.getByRole('button',{name:'How this was assessed',exact:true});
        assert.equal(await assessment.getAttribute('aria-expanded'),'false');
        await assessment.click();
        assert.equal(await assessment.getAttribute('aria-expanded'),'true');
        await page.getByText(/This is review guidance, not a security guarantee/).waitFor();
        await assessment.click();
        assert.equal(await assessment.getAttribute('aria-expanded'),'false');
        await page.getByRole('button',{name:'Toggle diff for src/network/retry.ts'}).click();
        await page.getByRole('button',{name:'Add Note',exact:true}).click();
        await page.getByRole('textbox',{name:'Personal review note'}).fill('Review the cancellation path.');
        await page.getByRole('button',{name:'Save Note',exact:true}).click();
        await page.getByText('My Notes (1)',{exact:true}).waitFor();
      }
      if(label==='repos'){
        await page.getByRole('textbox',{name:'Search repositories'}).fill('review-app');
        assert.equal(await page.getByRole('switch').count(),1);
      }
      results.push({label,width,theme,...dimensions});
    }
    authenticated=true;
    for(const [label,path,ready] of [
      ['inbox','/inbox',titles[0]],['triage','/triage','Triage Deck'],['notifications','/notifications','Notifications'],['settings','/settings','Configure repositories'],['search','/search','Results'],['highlight','/highlight','Screenshot Insight'],['repos','/repos','Repositories'],['consent','/consent','AI Consent'],['pr-detail','/pr/octocat/review-app/1429','AI Summary'],['billing','/billing','Your subscription'],['billing-success','/billing/success','Checkout received'],['billing-cancel','/billing/cancel','Checkout canceled'],['account-delete','/account/delete','What will be removed'],['privacy','/privacy','Privacy Policy'],['terms','/terms','Terms of Service'],['support','/support','Support & Contact'],['delete-account','/delete-account','Account Deletion'],['news','/news','Product News'],['changelog','/changelog','Changelog'],['auth-callback','/auth/callback','Could not sign you in'],
    ])await capture(label,path,ready);
    authenticated=false;
    await capture('sign-in','/sign-in','Connect your GitHub');
    await capture('onboarding-1','/welcome','Catch up fast');
    for(let step=2;step<=3;step++){
      await page.getByRole('button',{name:'Continue',exact:true}).click();
      await page.screenshot({path:resolve(output,`onboarding-${step}-${width}-${theme}.png`)});
      results.push({label:`onboarding-${step}`,width,theme});
    }
    delayMe=true;await capture('splash','/','Your developer review companion');delayMe=false;
    authenticated=true;notificationMode='error';
    await capture('system-error','/inbox','Could not load your inbox');
    notificationMode='empty';await capture('system-empty','/inbox','Inbox Zero');notificationMode='normal';
    assert.deepEqual(errors,[],`${width}/${theme} runtime errors`);
    await context.close();
  }
  await writeFile(resolve(output,'visual-results.json'),JSON.stringify({results,apiCalls,noLiveProviderCalls:true},null,2));
  console.log(JSON.stringify({screenshots:results.length,screenChecks:results.length,errors:0,output}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
