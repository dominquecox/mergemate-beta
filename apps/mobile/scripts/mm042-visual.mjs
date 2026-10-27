import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

// Review harness only. Runs the real exported app against isolated API fixtures.
const root=resolve(fileURLToPath(new URL('../dist',import.meta.url)));
const output=resolve(fileURLToPath(new URL('../review/mm042',import.meta.url)));
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
const authenticated=true;
const apiCalls=[];
const results=[];
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  await mkdir(output,{recursive:true});
  for(const width of [393,1440])for(const theme of ['dark','light']){
    const context=await browser.newContext({viewport:{width,height:width===393?1000:1050},deviceScaleFactor:1,colorScheme:theme,timezoneId:'America/Indiana/Indianapolis'});
    await context.addInitScript(()=>localStorage.setItem('mergemate_demo_session','true'));
    const page=await context.newPage();page.setDefaultTimeout(15000);const errors=[];const expectedResourceErrors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error'){if(notificationMode==='error' && /status of 502/.test(message.text()))expectedResourceErrors.push(message.text());else errors.push(message.text());}});
    await page.route('**/*',async route=>{
      const request=route.request();const url=new URL(request.url());
      if(url.origin===origin || url.protocol==='data:')return route.continue();
      if(url.origin!=='https://api-mm042.example')return route.abort();
      apiCalls.push({method:request.method(),path:url.pathname});
      const headers={'content-type':'application/json','access-control-allow-origin':origin,'access-control-allow-credentials':'true','access-control-allow-headers':'content-type,x-csrf-token,authorization','access-control-allow-methods':'GET,POST,PUT,DELETE,OPTIONS'};
      if(request.method()==='OPTIONS')return route.fulfill({status:204,headers,body:''});
      const path=url.pathname.replace('/v1','');let body;let status=200;
      if(path==='/me'){if(authenticated)body=user;else{status=401;body={error:{code:'unauthorized',message:'Sign in.',requestId:'fixture'}};}}
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
      else if(path==='/installations')body={items:[],installUrl:'https://github.com/apps/example/installations/new'};
      else if(path.endsWith('/summary'))body=summary;
      else if(path.endsWith('/risk'))body={level:'medium',reasons:['Touches request retry behavior.','Check the cancellation tests.'],coverage};
      else if(path.startsWith('/prs/'))body=detail;
      else if(path.endsWith('/activity'))body={items:[],nextCursor:at};
      else {status=404;body={error:{code:'not_found',message:'Unknown fixture endpoint.',requestId:'fixture'}};}
      return route.fulfill({status,headers,body:JSON.stringify(body)});
    });
    await page.goto(origin+'/settings');
    await page.getByRole('radio',{name:`${theme} theme`,exact:true}).click();
    async function navigate(name){
      if(width>=1024)await page.getByRole('link',{name,exact:true}).click();
      else await page.getByRole('tab',{name:name==='Triage'?'Triage deck tab':name==='Alerts'?'Alerts tab':`${name} tab`,exact:true}).click();
    }
    async function check(label){
      await page.evaluate(()=>document.fonts.ready);
      const dimensions=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,fonts:[...document.fonts].map(font=>({family:font.family,status:font.status}))}));
      assert.ok(dimensions.scroll<=dimensions.width,`${label}: horizontal overflow ${dimensions.scroll}/${dimensions.width}`);
      assert.equal(await page.getByRole('button',{name:/^(merge pull request|approve|request changes|close pull request)$/i}).count(),0);
      results.push({width,theme,screen:label,...dimensions});
    }
    await navigate('Inbox');await page.getByText(titles[0],{exact:true}).filter({visible:true}).first().waitFor();await check('inbox');
    assert.equal(await page.getByRole('navigation',{name:'Main navigation',exact:true}).count(),width>=1024?1:0);
    await page.screenshot({path:resolve(output,`inbox-${width}-${theme}.png`),fullPage:true});
    await page.getByRole('tab',{name:'Needs review pull requests',exact:true}).click();
    await page.getByText(titles[0],{exact:true}).filter({visible:true}).first().waitFor();
    await page.getByRole('tab',{name:'All pull requests',exact:true}).click();
    await page.getByRole('button',{name:/Open pull request #1429:/}).click();
    await page.getByText('AI PR Summary',{exact:true}).waitFor();await check('pr detail');
    await page.screenshot({path:`/private/tmp/mm042-pr-${width}-${theme}.png`});
    await page.getByRole('button',{name:'Go back',exact:true}).click();
    await navigate('Alerts');await page.getByText(titles[0],{exact:true}).filter({visible:true}).first().waitFor();await check('notifications');
    await navigate('Triage');await page.getByRole('button',{name:'Needs you',exact:true}).waitFor();await check('triage');
    await navigate('Settings');await page.getByRole('radio',{name:`${theme} theme`,exact:true}).waitFor();await check('settings');
    await page.screenshot({path:`/private/tmp/mm042-settings-${width}-${theme}.png`});
    await navigate('Inbox');
    await page.getByRole('button',{name:'Search pull requests',exact:true}).first().click();
    await page.getByRole('textbox').first().fill('retry');await check('search');
    await page.getByRole('button',{name:'Go back',exact:true}).click();
    if(width===393 && theme==='dark'){
      notificationMode='error';
      await page.getByRole('tab',{name:'Needs review pull requests',exact:true}).click();
      await page.getByText('Could not load your inbox',{exact:true}).waitFor();await check('inbox error');
      notificationMode='normal';await page.getByRole('button',{name:'Try Again',exact:true}).click();
      await page.getByText(titles[0],{exact:true}).filter({visible:true}).first().waitFor();
      notificationMode='empty';await page.getByRole('tab',{name:'All pull requests',exact:true}).click();
      await page.getByText('Inbox Zero',{exact:true}).waitFor();await check('inbox empty');
      notificationMode='normal';await page.getByRole('button',{name:'Refresh Inbox',exact:true}).click();
      await page.getByText(titles[0],{exact:true}).filter({visible:true}).first().waitFor();
    }
    results.push({width,theme,screen:'console',unexpectedErrors:errors,expectedResourceErrors});
    assert.deepEqual(errors,[],`${width}/${theme} browser errors`);
    await context.close();
  }
  await writeFile(resolve(output,'visual-results.json'),JSON.stringify({results,apiCalls,noLiveProviderCalls:true},null,2));
  console.log(JSON.stringify({screenshots:4,screenChecks:results.length,errors:0,output}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
