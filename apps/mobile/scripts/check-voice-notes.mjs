import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {dirname,extname,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../dist');
const proof='/private/tmp/mergemate-voice-notes';await mkdir(proof,{recursive:true});
const server=createServer(async(req,res)=>{try{let file=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+sep)&&file!==root){res.writeHead(404).end();return;}let body;try{body=await readFile(file);}catch{file=resolve(root,'index.html');body=await readFile(file);}res.writeHead(200,{'permissions-policy':'camera=(), microphone=(self), geolocation=()', 'content-security-policy':`default-src 'self';script-src 'self';connect-src 'self' https://api-dev.mergemate.dev;img-src 'self' data: https://avatars.githubusercontent.com;style-src 'self' 'unsafe-inline';font-src 'self' data:;media-src 'self' blob:;base-uri 'none';form-action 'self';frame-ancestors 'none'`,'content-type':{'.js':'application/javascript','.css':'text/css','.png':'image/png','.ttf':'font/ttf','.ico':'image/x-icon'}[extname(file)]??'text/html'}).end(body);}catch{res.writeHead(500).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;let browser;
try{
 browser=await chromium.launch({headless:true,channel:'chrome',args:['--mute-audio']});
 for(const width of [393,1440])for(const mode of ['on','off','no-consent','denied']){
  const context=await browser.newContext({viewport:{width,height:1050},serviceWorkers:'block'});let transcriptCalls=0,saveCalls=0,failProvider=true,failSave=true,notes=[];
  await context.addInitScript(denied=>{
   window.__voiceTracks=[];window.__voiceRequested=false;
   const Original=window.AudioContext;window.AudioContext=class extends Original{constructor(...args){super(...args);window.__voiceAudio=this;}};
   navigator.mediaDevices.getUserMedia=async constraints=>{
    window.__voiceRequested=true;if(denied)throw new DOMException('Microphone access denied','NotAllowedError');
    // An oscillator-backed microphone fixture exercises actual Chrome PCM processing,
    // without requesting this Mac's microphone or altering its system permissions.
    const source=new Original({sampleRate:48000});await source.resume();const oscillator=source.createOscillator(),destination=source.createMediaStreamDestination();oscillator.frequency.value=440;oscillator.connect(destination);oscillator.start();
    const stream=destination.stream;for(const track of stream.getTracks()){const stop=track.stop.bind(track);track.stop=()=>{stop();oscillator.stop();void source.close();};}window.__voiceTracks.push(...stream.getTracks());return stream;
   };
  },mode==='denied');
  await context.grantPermissions(['microphone'],{origin:base});
  const page=await context.newPage();page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());if(url.origin===base || ['blob:','data:'].includes(url.protocol))return route.continue();if(url.origin!=='https://api-dev.mergemate.dev')return route.abort();
   const headers={'content-type':'application/json','access-control-allow-origin':base,'access-control-allow-credentials':'true','access-control-allow-headers':'content-type,x-csrf-token','access-control-allow-methods':'GET,POST,PUT,DELETE,OPTIONS'};
   const reply=(status,body)=>route.fulfill({status,headers,body:JSON.stringify(body)});if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});const path=url.pathname.replace('/v1','');
   if(path==='/flags')return reply(200,{voice_readout:false,voice_notes:mode!=='off',highlight:true});
   if(path==='/me')return reply(200,{id:'voice-fixture',login:'fixture',name:'Fixture',avatarUrl:base+'/favicon.ico',demo:false});
   if(path==='/auth/refresh')return reply(200,{session:{expiresAt:'2099-01-01T00:00:00.000Z',csrfToken:'fixture-csrf'}});
   if(path==='/auth/csrf')return reply(200,{csrfToken:'fixture-csrf'});
   if(path==='/consent/preferences')return reply(200,{ai:{granted:mode!=='no-consent',version:'1',currentVersion:'1'},aiSummaries:true,revision:'fixture'});if(path==='/consent')return reply(200,{ai:{granted:mode!=='no-consent',version:'1',at:'2026-10-29T00:00:00.000Z'}});
   if(path==='/push/web-key')return reply(200,{publicKey:null});
   if(path==='/notifications')return reply(200,{items:[],nextCursor:null});
   if(path.includes('/pages/'))return reply(200,{items:[],nextCursor:null,headSha:'abc123',capped:false});
   if(path==='/prs/fixture/repo/7')return reply(200,{repo:'fixture/repo',number:7,title:'Voice fixture review',body:'Existing review body.',author:'fixture',status:'open',baseBranch:'main',headBranch:'feature',headSha:'abc123',additions:3,deletions:1,changedFiles:1,files:[],checks:[],threads:[],createdAt:'2026-10-28T10:00:00.000Z',updatedAt:'2026-10-28T12:00:00.000Z',htmlUrl:'https://github.com/fixture/repo/pull/7'});
   if(path.endsWith('/summary') || path.endsWith('/risk'))return reply(503,{error:{code:'upstream_unavailable',message:'Fixture AI disabled',requestId:'fixture'}});
   if(path==='/notes' && request.method()==='GET'){const scope=JSON.parse(url.searchParams.get('context'));return reply(200,{items:notes.filter(note=>JSON.stringify(note.context)===JSON.stringify(scope))});}
   if(path==='/notes' && request.method()==='POST'){saveCalls++;if(failSave){failSave=false;return reply(503,{error:{code:'upstream_unavailable',message:'Fixture save failure',requestId:'fixture'}});}const input=request.postDataJSON();const note={...input,createdAt:'2026-10-29T00:00:00.000Z'};notes=[...notes.filter(old=>old.id!==note.id),note];return reply(200,note);}
   if(path.startsWith('/notes/') && request.method()==='DELETE'){notes=notes.filter(item=>item.id!==path.split('/').at(-1));return route.fulfill({status:204,headers});}
   if(path==='/voice-notes'){
    transcriptCalls++;const bytes=request.postDataBuffer();assert(bytes && bytes.length>44 && bytes.length<=3840044);assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.readUInt32LE(24),16000);assert.equal(bytes.readUInt16LE(22),1);assert.equal(bytes.readUInt32LE(40),bytes.length-44);
    if(failProvider){failProvider=false;return reply(502,{error:{code:'upstream_unavailable',message:'Fixture provider failure',requestId:'fixture'}});}return reply(200,{text:'Transcript to review before saving',requestId:'fixture'});
   }
   return reply(404,{error:{code:'not_found',message:'Unavailable',requestId:'fixture'}});
  });
  await page.goto(base+'/pr/fixture/repo/7');await page.getByRole('button',{name:'Add Note',exact:true}).click();await page.getByText('No private notes saved here yet.').waitFor();
  const record=page.getByRole('button',{name:'Record voice note',exact:true});
  if(mode==='off'||mode==='no-consent'){assert.equal(await record.count(),0);assert.equal(transcriptCalls,0);}
  else if(mode==='denied'){await record.click();await page.getByRole('alert').filter({hasText:/Microphone access denied/}).waitFor();assert.equal(transcriptCalls,0);}
  else{
   await record.click();try{await page.getByText(/0:01 \/ 2:00/).waitFor();}catch(error){await page.screenshot({path:`${proof}/debug-${mode}-${width}.png`,fullPage:true});console.log('recording fixture state',await page.locator('body').innerText(),await page.evaluate(()=>({requested:window.__voiceRequested,tracks:window.__voiceTracks.length,audio:window.__voiceAudio?.state,activation:navigator.userActivation.hasBeenActive})));throw error;}await page.getByRole('button',{name:'Pause recording',exact:true}).click();await page.getByText('Recording paused.',{exact:true}).waitFor();await page.screenshot({path:`${proof}/recording-paused-${width}.png`,fullPage:true});
   await page.getByRole('button',{name:'Resume recording',exact:true}).click();await page.getByRole('button',{name:'Stop recording',exact:true}).click();await page.getByRole('button',{name:'Play recording',exact:true}).click();await page.getByRole('button',{name:'Stop playback',exact:true}).click();
   assert(await page.evaluate(()=>window.__voiceTracks.every(track=>track.readyState==='ended')));
   await page.getByRole('button',{name:'Transcribe recording',exact:true}).click();await page.getByText(/Could not transcribe this recording/).waitFor();assert.equal(saveCalls,0);await page.screenshot({path:`${proof}/transcription-error-${width}.png`,fullPage:true});
   await page.getByRole('button',{name:'Transcribe recording',exact:true}).click();await page.waitForFunction(()=>document.querySelector('textarea[aria-label="Private note text"]')?.value==='Transcript to review before saving');await page.getByRole('textbox',{name:'Private note text'}).fill('Reviewed and edited private note');assert.equal(saveCalls,0);
   await page.getByRole('button',{name:'Save private note',exact:true}).click();await page.getByText(/Could not save this note/).waitFor();assert.equal(await page.getByRole('textbox',{name:'Private note text'}).inputValue(),'Reviewed and edited private note');
   await page.getByRole('button',{name:'Save private note',exact:true}).click();await page.getByRole('button',{name:'Remove note 1',exact:true}).waitFor();assert.equal(notes.length,1);assert.deepEqual(notes[0].context,{kind:'pr',repo:'fixture/repo',number:7});await page.screenshot({path:`${proof}/note-saved-${width}.png`,fullPage:true});
   await page.reload();await page.getByRole('button',{name:'Add Note',exact:true}).click();await page.getByText('Reviewed and edited private note',{exact:true}).waitFor();
   await record.click();await page.getByText(/0:01 \/ 2:00/).waitFor();await page.getByRole('button',{name:'Cancel recording',exact:true}).click();await record.waitFor();assert.equal(transcriptCalls,2);assert(await page.evaluate(()=>window.__voiceTracks.every(track=>track.readyState==='ended')));
   await record.click();await page.getByText(/0:01 \/ 2:00/).waitFor();await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});document.dispatchEvent(new Event('visibilitychange'));});await record.waitFor();assert(await page.evaluate(()=>window.__voiceTracks.every(track=>track.readyState==='ended')));assert.equal(transcriptCalls,2);
   await page.goto(base+'/highlight');await page.getByText('No private notes saved here yet.').waitFor();assert.equal(await page.getByText('Reviewed and edited private note',{exact:true}).count(),0);
   await record.click();await page.getByText(/0:01 \/ 2:00/).waitFor();await page.getByRole('button',{name:'Stop recording',exact:true}).click();await page.getByRole('button',{name:'Transcribe recording',exact:true}).click();await page.waitForFunction(()=>document.querySelector('textarea[aria-label="Private note text"]')?.value==='Transcript to review before saving');await page.getByRole('textbox',{name:'Private note text'}).fill('Highlight review note');await page.getByRole('button',{name:'Save private note',exact:true}).click();await page.getByRole('button',{name:'Remove note 1',exact:true}).waitFor();assert.equal(notes.length,2);assert.deepEqual(notes[1].context,{kind:'highlight'});await page.screenshot({path:`${proof}/highlight-saved-${width}.png`,fullPage:true});
   await page.reload();await page.getByText('Highlight review note',{exact:true}).waitFor();assert.equal(await page.getByText('Reviewed and edited private note',{exact:true}).count(),0);

  }
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);await page.screenshot({path:`${proof}/${mode}-${width}.png`,fullPage:true});await context.close();
 }
 console.log('PASS voice-notes browser: 8 phone/desktop scenarios; real Chrome Web Audio processing with oscillator microphone fixture, pause/resume/playback/cleanup, provider and save failure/retry, edited confirmation, reopen, flag/consent/permission gates. External API/provider replies mocked.');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
