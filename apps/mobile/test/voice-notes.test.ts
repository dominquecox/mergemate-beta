import {describe,it,expect} from 'vitest';
import {PcmRecording,VOICE_RATE} from '../src/voice/pcm';
import {makeClient,jsonResponse,NOW} from './helpers';
const context={kind:'highlight'} as const;
const note={id:'c45c2db6-56b4-4caf-b6cc-719093a39180',context,text:'Edited private transcript',createdAt:NOW};
describe('voice PCM normalization',()=>{
 it('normalizes hardware stereo 48k to bounded mono16k PCM WAV and drops paused audio',()=>{
  const recording=new PcmRecording();recording.add(new Float32Array(48000*2).fill(.5),48000,2);
  recording.paused=true;recording.add(new Float32Array(48000),48000,1);expect(recording.seconds).toBe(1);
  recording.paused=false;recording.add(new Float32Array(16000),16000,1);
  const out=recording.wav(),v=new DataView(out.buffer);expect(recording.seconds).toBe(2);expect(out.length).toBe(44+64000);expect(v.getUint32(24,true)).toBe(16000);expect(v.getUint16(22,true)).toBe(1);expect(v.getInt16(44,true)).toBeCloseTo(16384,0);
  recording.clear();expect(recording.seconds).toBe(0);expect(()=>recording.wav()).toThrow();
 });
 it('stops exactly at two minutes regardless of chunk overshoot, below the upload cap',()=>{
  const recording=new PcmRecording();for(let i=0;i<119;i++)expect(recording.add(new Float32Array(VOICE_RATE),VOICE_RATE,1)).toBe(false);
  expect(recording.add(new Float32Array(VOICE_RATE*3),VOICE_RATE,1)).toBe(true);expect(recording.seconds).toBe(120);expect(recording.wav().length).toBe(3840044);recording.clear();
 });
 it('refuses unusable hardware metadata and empty recordings',()=>{const recording=new PcmRecording();expect(()=>recording.add(new Float32Array(100),0,1)).toThrow();expect(()=>recording.add(new Float32Array(100),48000,0)).toThrow();expect(()=>recording.wav()).toThrow();});
});
describe.each(['web','native'] as const)('voice and private notes over %s transport',platform=>{
 it('uploads actual WAV bytes with credentials and no multipart native Blob assumption',async()=>{
  const controller=new AbortController();const {client,calls}=makeClient(req=>req.path==='/auth/csrf'?jsonResponse({csrfToken:'fixture-csrf'}):jsonResponse({text:'provider transcript',requestId:'fixture'}),{platform,token:'fixture-session'});
  expect(await client.transcribeVoice(new Uint8Array([82,73,70,70]),controller.signal)).toBe('provider transcript');const call=calls.at(-1);expect(call?.headers['content-type']).toBe('audio/wav');expect(call?.rawBody).toBeInstanceOf(ArrayBuffer);expect(Array.from(new Uint8Array(call?.rawBody instanceof ArrayBuffer?call.rawBody:new ArrayBuffer(0)))).toEqual([82,73,70,70]);
  controller.abort();expect(call?.signal?.aborted).toBe(true);expect(call?.credentials).toBe(platform==='web'?'include':'omit');
 });
 it('confirms only edited text, preserves idempotency key and loads its exact private context',async()=>{
  const {client,calls}=makeClient(req=>req.path==='/auth/csrf'?jsonResponse({csrfToken:'fixture-csrf'}):req.path.startsWith('/notes?')?jsonResponse({items:[note]}):jsonResponse(note),{platform,token:'fixture-session'});
  await client.savePrivateNote({id:note.id,context,text:note.text});expect(calls.at(-1)?.body).toEqual({id:note.id,context,text:note.text});expect(await client.getPrivateNotes(context)).toEqual([note]);expect(decodeURIComponent(calls.at(-1)?.path??'')).toContain(JSON.stringify(context));
 });
});
