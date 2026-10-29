import {afterEach,describe,it,expect,vi} from 'vitest';
import {startVoiceCapture} from '../src/voice/driver.web';
afterEach(()=>vi.unstubAllGlobals());
describe('web microphone permissions and cancellation',()=>{
 it('surfaces denied permission without creating an audio context',async()=>{
  const context=vi.fn();vi.stubGlobal('AudioContext',context);vi.stubGlobal('navigator',{mediaDevices:{getUserMedia:async()=>{throw new DOMException('Microphone denied','NotAllowedError');}}});
  await expect(startVoiceCapture(()=>{})).rejects.toThrow('Microphone denied');expect(context).not.toHaveBeenCalled();
 });
 it('stops tracks from a permission request resolved after cancellation',async()=>{
  let resolve:(stream:{getTracks:()=>{stop:()=>void}[]})=>void=()=>{};const pending=new Promise<{getTracks:()=>{stop:()=>void}[]}>(r=>{resolve=r;});const stop=vi.fn(),context=vi.fn();
  vi.stubGlobal('AudioContext',context);vi.stubGlobal('navigator',{mediaDevices:{getUserMedia:()=>pending}});
  const abort=new AbortController();const result=startVoiceCapture(()=>{},undefined,abort.signal);abort.abort();resolve({getTracks:()=>[{stop}]});await expect(result).rejects.toThrow('Recording cancelled');expect(stop).toHaveBeenCalledOnce();expect(context).not.toHaveBeenCalled();
 });
});
