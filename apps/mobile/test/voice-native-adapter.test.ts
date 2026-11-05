import {afterEach,describe,it,expect,vi} from 'vitest';
const fixture=vi.hoisted(()=>({granted:true,permissionWait:null as Promise<void>|null,requests:0,writeFails:false,stopped:0,released:0,removed:0,played:0,files:new Set<string>(),listener:((_buffer:{data:ArrayBuffer;sampleRate:number;channels:number})=>{})}));
vi.mock('expo-audio',()=>({
 requestRecordingPermissionsAsync:async()=>{fixture.requests++;await fixture.permissionWait;return {granted:fixture.granted};},setAudioModeAsync:async()=>{},
 AudioModule:{AudioStream:class{
  addListener(_event:string,listener:typeof fixture.listener){fixture.listener=listener;return {remove(){fixture.removed++;}};}
  async start(){} stop(){fixture.stopped++;} release(){fixture.released++;}
 }},
 createAudioPlayer:()=>({currentTime:0,duration:0,playing:false,addListener:()=>({remove(){}}),async seekTo(){},play(){fixture.played++;},pause(){},remove(){fixture.removed++;}}),
}));
vi.mock('expo-crypto',()=>({randomUUID:()=> 'f417382c-f246-46d8-b648-b47c595e7788'}));
vi.mock('expo-file-system',()=>({Paths:{cache:'cache/'},Directory:class{list(){return [];}},File:class{
 uri:string;name:string;constructor(_base:string,name:string){this.name=name;this.uri=name;}
 get exists(){return fixture.files.has(this.uri);}create(){fixture.files.add(this.uri);}write(_bytes:Uint8Array){if(fixture.writeFails)throw new Error('Fixture disk failure');}delete(){fixture.files.delete(this.uri);}
}}));
import {startVoiceCapture,createVoicePreview} from '../src/voice/driver.native';
afterEach(()=>{fixture.granted=true;fixture.permissionWait=null;fixture.requests=0;fixture.writeFails=false;fixture.stopped=0;fixture.released=0;fixture.removed=0;fixture.played=0;fixture.files.clear();});
describe('SDK58 native PCM adapter with fixture microphone and file APIs',()=>{
 it('refuses denied permission before capturing',async()=>{fixture.granted=false;await expect(startVoiceCapture(()=>{})).rejects.toThrow('Microphone access is off');expect(fixture.stopped).toBe(0);});
 it('does not start a microphone after a cancelled permission prompt resolves',async()=>{
  let resolve:()=>void=()=>{};fixture.permissionWait=new Promise<void>(r=>{resolve=r;});const abort=new AbortController();const pending=startVoiceCapture(()=>{},undefined,abort.signal);await vi.waitFor(()=>expect(fixture.requests).toBe(1));abort.abort();resolve();await expect(pending).rejects.toThrow('Recording cancelled');expect(fixture.stopped).toBe(0);
 });
 it('removes a partially written preview if disk write fails',async()=>{fixture.writeFails=true;await expect(createVoicePreview(new Uint8Array(44))).rejects.toThrow('Fixture disk failure');expect(fixture.files.size).toBe(0);});
 it('records, pauses, resumes, stops and deletes the playback file',async()=>{
  const capture=await startVoiceCapture(()=>{});const frame={data:new Float32Array(16000).fill(.25).buffer,sampleRate:16000,channels:1};
  fixture.listener(frame);capture.pause();fixture.listener(frame);capture.resume();fixture.listener(frame);
  const bytes=await capture.stop();expect(bytes.length).toBe(64044);expect(fixture.stopped).toBe(1);expect(fixture.released).toBe(1);
  const playback=await createVoicePreview(bytes);expect(fixture.files.size).toBe(1);await playback.play();expect(fixture.played).toBe(1);await playback.dispose();expect(fixture.files.size).toBe(0);
 });
 it('cancel releases the microphone without leaving a recording file',async()=>{const capture=await startVoiceCapture(()=>{});fixture.listener({data:new Float32Array(16000).buffer,sampleRate:16000,channels:1});await capture.dispose();await capture.dispose();expect(fixture.stopped).toBe(1);expect(fixture.files.size).toBe(0);});
});
