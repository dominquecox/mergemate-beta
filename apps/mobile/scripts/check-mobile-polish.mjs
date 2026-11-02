import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../dist'),proof=process.env.MM_POLISH_PROOF_DIR??'/tmp/mergemate-mobile-polish';await mkdir(proof,{recursive:true});
const server=createServer(async(req,res)=>{try{let path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!path.startsWith(root+sep)){res.writeHead(404).end();return;}let body;try{body=await readFile(path);}catch{path=resolve(root,'index.html');body=await readFile(path);}res.writeHead(200,{'content-type':{'.js':'application/javascript','.css':'text/css','.ttf':'font/ttf','.png':'image/png'}[extname(path)]??'text/html'}).end(body);}catch{res.writeHead(500).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`,date='2026-11-02T12:00:00Z',sha='a'.repeat(40);
const title='Improve the entire authentication interface with a deliberately verbose pull request title that must remain accessible while the Inbox card stays compact';
const glyphs=JSON.parse(await readFile(resolve(root,'../../../node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json'),'utf8'));
let browser;
try{browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'/usr/bin/chromium'),args:['--no-sandbox']});for(const width of [360,393,1440]){
 const context=await browser.newContext({viewport:{width,height:850},serviceWorkers:'block'});await context.addInitScript(()=>{window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>[{localService:true,name:'Fixture',voiceURI:'fixture',lang:'en-US'}],speak:()=>{},cancel:()=>{},pause:()=>{},resume:()=>{}}});});const page=await context.newPage();page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',e=>errors.push(e.message));let saved=false;
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());if(url.protocol==='data:')return route.continue();if(url.origin!==base)return route.abort();if(!url.pathname.startsWith('/__api/v1'))return route.continue();
  const path=url.pathname.replace('/__api/v1',''),reply=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  if(path==='/me')return reply({id:'fixture',login:'fixture',name:'Fixture User',avatarUrl:base+'/favicon.ico',demo:false});
  if(path==='/auth/refresh')return reply({session:{expiresAt:'2099-01-01T00:00:00Z',csrfToken:'fixture'}});
  if(path==='/auth/csrf')return reply({csrfToken:'fixture'});
  if(path==='/flags')return reply({voice_readout:true,voice_notes:false,highlight:false});
  if(path==='/consent/preferences')return reply({ai:{granted:false,version:null,currentVersion:'1'},aiSummaries:false,revision:'fixture'});
  if(path==='/inbox/preference')return reply({filter:'all'});
  if(path==='/inbox/undo')return reply(null);
  if(path==='/notifications')return reply({items:[{id:'fixture',kind:'review',repo:'acme/app',number:7,title,author:'fixture',status:'open',updatedAt:date,read:false}],nextCursor:null});
  if(path==='/notes'){
   if(req.method()==='POST'){saved=true;return reply({...req.postDataJSON(),createdAt:date},201);}
   return reply({items:[]});
  }
  if(path==='/prs/acme/app/7')return reply({repo:'acme/app',number:7,title,body:'Fixture',author:'fixture',status:'open',baseBranch:'main',headBranch:'docs',headSha:sha,additions:1,deletions:0,changedFiles:1,files:[],checks:[],threads:[],createdAt:date,updatedAt:date,htmlUrl:'https://github.com/acme/app/pull/7',checkCursor:null});
  if(path.includes('/pages/'))return reply({items:path.endsWith('/files')?[{path:'README.md',status:'modified',additions:1,deletions:0,patch:'+Docs',patchState:'available'}]:[],nextCursor:null,headSha:sha});
  if(path.endsWith('/dependencies'))return reply({headSha:sha,manifests:[],unavailable:['']});
  return reply({error:{code:'not_found',message:'Fixture unavailable',requestId:'fixture'}},404);
 });
 await page.goto(base+'/inbox');const icon=async(button,name)=>assert((await button.innerText()).includes(String.fromCodePoint(glyphs[name])));const listen=page.getByRole('button',{name:'Play Inbox overview',exact:true});await listen.waitFor();await icon(listen,'headset-outline');await listen.click();const pause=page.getByRole('button',{name:'Pause Inbox overview',exact:true});await pause.waitFor();await icon(pause,'pause-outline');await pause.click();const resume=page.getByRole('button',{name:'Resume Inbox overview',exact:true});await resume.waitFor();await icon(resume,'play-outline');await page.getByRole('button',{name:'Stop Inbox overview',exact:true}).click();await listen.waitFor();const review=page.getByRole('tab',{name:'Needs review pull requests',exact:true});await review.waitFor();assert.equal(await review.innerText(),'Review');
 const tabs=await page.getByRole('tab').all();for(const tab of tabs){const box=await tab.boundingBox();assert(box&&box.height>=44&&box.width>=44);assert.equal(await tab.locator('div').last().evaluate(el=>getComputedStyle(el).whiteSpace),'nowrap');}
 const card=page.getByRole('button',{name:new RegExp('Open pull request #7:')});await card.waitFor();const text=page.getByLabel(title,{exact:true});await text.waitFor();const titleBox=await text.boundingBox();assert(titleBox&&titleBox.height<=26);assert((await card.getAttribute('aria-label')).includes(title));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`${proof}/inbox-${width}.png`,fullPage:true});
 await card.click();await icon(page.getByRole('button',{name:'Listen to Executive Digest',exact:true}),'headset-outline');const add=page.getByRole('button',{name:'Add Note',exact:true});await add.waitFor();await page.setViewportSize({width,height:480});await add.click();const input=page.getByRole('textbox',{name:'Private note text',exact:true});await input.waitFor();await input.fill('Fixture private note');await input.focus();const save=page.getByRole('button',{name:'Save private note',exact:true});await save.waitFor();await page.waitForTimeout(250);
 const bar=await page.getByTestId('executive-action-bar').boundingBox(),inputBox=await input.boundingBox(),saveBox=await save.boundingBox();assert(bar&&inputBox&&saveBox);assert(inputBox.y>=0&&inputBox.y+inputBox.height<=bar.y+1,JSON.stringify({inputBox,bar}));assert(saveBox.y>=0&&saveBox.y+saveBox.height<=bar.y+1,JSON.stringify({saveBox,bar}));await page.screenshot({path:`${proof}/note-${width}.png`,fullPage:true});await save.click();await page.getByText('Private note saved.',{exact:true}).waitFor();assert(saved);assert.deepEqual(errors,[]);console.log(`PASS ${width}: consistent headset/pause/resume icons, compact Review tab and single-line full-accessibility title; note input/Save visible at480px and saved; fixture API, not a physical keyboard`);await context.close();
}}finally{await browser?.close();await new Promise(r=>server.close(r));}
