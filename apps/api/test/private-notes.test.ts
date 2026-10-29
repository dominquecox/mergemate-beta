import {describe,it,expect} from 'vitest';
import {PrivateNotes,PrivateNote,VoiceNoteResult} from '@mergemate/contracts';
import {testContext,json,validModelEnv} from './helpers';
import {appFor,signIn,post} from './sign-in';
import {demoHeaders} from './demo-session';
const highlight={kind:'highlight'};
const query=(context:unknown)=>`/v1/notes?context=${encodeURIComponent(JSON.stringify(context))}`;
const input=(text='A reviewed private transcript',context:unknown=highlight)=>({id:crypto.randomUUID(),context,text});
const wav=()=>{const out=new Uint8Array(3244),v=new DataView(out.buffer);for(const [offset,text] of [[0,'RIFF'],[8,'WAVE'],[12,'fmt '],[36,'data']] as const)for(let i=0;i<text.length;i++)out[offset+i]=text.charCodeAt(i);v.setUint32(4,out.length-8,true);v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,16000,true);v.setUint32(28,32000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);v.setUint32(40,3200,true);return out;};
describe('durable private notes',()=>{
 it('requires sign-in and refuses demo writes',async()=>{const ctx=testContext(),call=appFor(ctx);expect((await call(query(highlight))).status).toBe(401);expect((await call('/v1/notes',post(input(),await demoHeaders(ctx)))).status).toBe(403);});
 it('saves, reopens and removes only owned notes; duplicate confirmation is idempotent',async()=>{
  const ctx=testContext(),call=appFor(ctx),one=await signIn(ctx),two=await signIn(ctx,'ios',{id:999,login:'other',name:null,avatar_url:'https://avatars.githubusercontent.com/u/999'}),note=input();
  expect(PrivateNote.parse(await (await call('/v1/notes',post(note,one.headers))).json()).text).toBe(note.text);
  expect((await call('/v1/notes',post(note,one.headers))).status).toBe(200);
  const own=await call(query(highlight),{headers:one.headers});expect(own.headers.get('cache-control')).toBe('no-store');expect(PrivateNotes.parse(await own.json()).items).toHaveLength(1);
  expect(PrivateNotes.parse(await (await call(query(highlight),{headers:two.headers})).json()).items).toEqual([]);
  expect((await call(`/v1/notes/${note.id}?context=${encodeURIComponent(JSON.stringify(highlight))}`,{method:'DELETE',headers:two.headers})).status).toBe(204);
  expect(PrivateNotes.parse(await (await call(query(highlight),{headers:one.headers})).json()).items).toHaveLength(1);
  expect((await call('/v1/notes',post({...note,text:'different'},one.headers))).status).toBe(422);
  await call(`/v1/notes/${note.id}?context=${encodeURIComponent(JSON.stringify(highlight))}`,{method:'DELETE',headers:one.headers});
  expect(PrivateNotes.parse(await (await call(query(highlight),{headers:one.headers})).json()).items).toEqual([]);
 });
 it('verifies current GitHub PR access for reads and writes; Highlight cannot expose PR notes',async()=>{
  const ctx=testContext(),call=appFor(ctx),{headers}=await signIn(ctx),context={kind:'pr',repo:'octo/private',number:7};
  ctx.net.on('GET','https://api.github.com/repos/octo/private/pulls/7',()=>json({number:7}));
  expect((await call('/v1/notes',post(input('PR note',context),headers))).status).toBe(200);
  expect(PrivateNotes.parse(await (await call(query(highlight),{headers})).json()).items).toEqual([]);
  expect(PrivateNotes.parse(await (await call(query(context),{headers})).json()).items).toHaveLength(1);
  ctx.net.on('GET','https://api.github.com/repos/octo/private/pulls/7',()=>json({message:'Not Found'},404));
  expect((await call(query(context),{headers})).status).toBe(404);
  expect((await call('/v1/notes',post(input('blocked',context),headers))).status).toBe(404);
 });
 it('rejects malformed scopes/text, bounds each workspace and cascades account deletion',async()=>{
  const ctx=testContext(),call=appFor(ctx),{headers,userId}=await signIn(ctx);
  for(const note of [input(''),input('x'.repeat(8001)),input('secret',{kind:'pr',repo:'../secret',number:1}),{...input(),userId:'someone-else'}])expect((await call('/v1/notes',post(note,headers))).status).toBe(422);
  for(let i=0;i<100;i++)expect((await call('/v1/notes',post(input(`Note ${i}`),headers))).status).toBe(200);
  expect((await call('/v1/notes',post(input(),headers))).status).toBe(422);
  expect(PrivateNotes.parse(await (await call(query(highlight),{headers})).json()).items).toHaveLength(100);
  await ctx.db.prepare('DELETE FROM users WHERE id=?').bind(userId).run();
  expect(await ctx.db.prepare('SELECT COUNT(*) AS n FROM private_notes').first()).toEqual({n:0});
 });
 it('requires web CSRF for confirmation',async()=>{const ctx=testContext(),call=appFor(ctx),{headers}=await signIn(ctx,'web');expect((await call('/v1/notes',post(input(),headers))).status).toBe(403);});
 it('transcribes bounded raw PCM, reviews before saving, meters one action without audio/text retention',async()=>{
  const ctx=testContext(validModelEnv()),call=appFor(ctx),{headers,userId}=await signIn(ctx);ctx.kv.set('flags:v1',JSON.stringify({voice_notes:true}));
  await call('/v1/consent',{...post({ai:{granted:true,version:'1'}},headers),method:'PUT'});
  ctx.net.on('POST','https://api.meta.ai/v1/asr/transcribe',()=>json({text:'provider transcript'}));
  const res=await call('/v1/voice-notes',{method:'POST',headers:{...headers,'content-type':'audio/wav'},body:wav()});
  expect(res.status).toBe(200);expect(res.headers.get('x-actions-remaining')).toBe('29');const transcript=VoiceNoteResult.parse(await res.json());
  expect(PrivateNotes.parse(await (await call(query(highlight),{headers})).json()).items).toEqual([]);
  await call('/v1/notes',post(input(transcript.text+' edited'),headers));
  expect(PrivateNotes.parse(await (await call(query(highlight),{headers})).json()).items[0]?.text).toBe('provider transcript edited');
  expect(await ctx.db.prepare('SELECT COUNT(*) AS n FROM private_notes WHERE user_id=?').bind(userId).first()).toEqual({n:1});
 });
});
