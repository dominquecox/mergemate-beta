import {afterEach,describe,it,expect,vi} from 'vitest';
const f=vi.hoisted(()=>({platform:{OS:'web'},native:vi.fn(),speech:{getAvailableVoicesAsync:vi.fn(),speak:vi.fn(),stop:vi.fn(async()=>undefined),pause:vi.fn(async()=>undefined),resume:vi.fn(async()=>undefined)}}));
vi.mock('react-native',()=>({Platform:f.platform}));vi.mock('expo',()=>({requireOptionalNativeModule:f.native}));vi.mock('expo-speech',()=>f.speech);
import {deviceSpeechDriver} from '../src/readout/driver';
import {ReadoutController} from '../src/readout/controller';
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();});
describe('offline-first platform speech adapters',()=>{
 it('rejects remote browser voices and selects an explicit local voice',async()=>{f.platform.OS='web';const remote={localService:false},local={localService:true};const synth={getVoices:vi.fn(()=>[remote]),speak:vi.fn(),cancel:vi.fn(),pause:vi.fn(),resume:vi.fn()};vi.stubGlobal('speechSynthesis',synth);class Utterance{voice:unknown;rate=1;onend:unknown;onerror:unknown;constructor(public text:string){}}vi.stubGlobal('SpeechSynthesisUtterance',Utterance);const driver=deviceSpeechDriver();expect(await driver.available()).toBe(false);synth.getVoices.mockReturnValue([remote,local]);expect(await driver.available()).toBe(true);driver.speak('Safe summary.',1.25,vi.fn(),vi.fn());expect(synth.speak).toHaveBeenCalledWith(expect.objectContaining({voice:local,rate:1.25,text:'Safe summary.'}));expect(f.speech.speak).not.toHaveBeenCalled();});
 it('Android stays unavailable when neither the adapter nor system voices are available',async()=>{f.platform.OS='android';f.native.mockReturnValueOnce(null);f.speech.getAvailableVoicesAsync.mockResolvedValueOnce([]);const driver=deviceSpeechDriver();expect(await driver.available()).toBe(false);const error=vi.fn();driver.speak('Safe.',1,vi.fn(),error);expect(error).toHaveBeenCalledOnce();expect(f.speech.speak).not.toHaveBeenCalled();});
 it('Android uses only the verified adapter and its selected voice',async()=>{f.platform.OS='android';const native={getLocalVoicesAsync:vi.fn(async()=>[{identifier:'installed-local',language:'en-US'}]),speakAsync:vi.fn(async()=>undefined),stopAsync:vi.fn(async()=>undefined)};f.native.mockReturnValueOnce(native);const driver=deviceSpeechDriver();expect(await driver.available()).toBe(true);driver.speak('Safe.',1,vi.fn(),vi.fn());expect(native.speakAsync).toHaveBeenCalledWith('Safe.','installed-local',1,expect.stringContaining('utterance-'));await driver.stop();expect(native.stopAsync).toHaveBeenCalledOnce();expect(driver.pause).toBeUndefined();expect(f.speech.speak).not.toHaveBeenCalled();});
 it.each(['missing','empty','probe failure','module failure'])('Android falls back to the configured system engine after %s',async mode=>{
  f.platform.OS='android';const local={getLocalVoicesAsync:vi.fn(async()=>[]),speakAsync:vi.fn(),stopAsync:vi.fn(async()=>undefined)};
  if(mode==='module failure')f.native.mockImplementationOnce(()=>{throw new Error('Fixture optional module unavailable');});
  else f.native.mockReturnValueOnce(mode==='missing'?null:local);
  if(mode==='probe failure')local.getLocalVoicesAsync.mockRejectedValueOnce(new Error('Fixture offline voice enumeration failed'));
  f.speech.getAvailableVoicesAsync.mockResolvedValueOnce([{identifier:'system-engine-voice'}]);
  const driver=deviceSpeechDriver(),done=vi.fn(),error=vi.fn();expect(await driver.available()).toBe(true);
  driver.speak('Safe summary.',1.25,done,error);
  expect(f.speech.speak).toHaveBeenCalledWith('Safe summary.',expect.objectContaining({voice:'system-engine-voice',rate:1.25,onDone:done,onError:error}));
  expect(local.speakAsync).not.toHaveBeenCalled();await driver.stop();expect(f.speech.stop).toHaveBeenCalledOnce();expect(driver.pause).toBeUndefined();expect(driver.resume).toBeUndefined();
 });
 it('Android system playback pauses by stopping and resumes the same sentence',async()=>{
  f.platform.OS='android';f.native.mockReturnValueOnce(null);f.speech.getAvailableVoicesAsync.mockResolvedValueOnce([{identifier:'system'}]);
  const controller=new ReadoutController(deviceSpeechDriver());await controller.play(['One.','Two.']);await controller.pause();expect(controller.state).toBe('paused');await controller.resume();
  expect(f.speech.speak).toHaveBeenCalledTimes(2);expect(f.speech.speak.mock.calls.map(call=>call[0])).toEqual(['One.','One.']);expect(f.speech.pause).not.toHaveBeenCalled();expect(f.speech.resume).not.toHaveBeenCalled();await controller.stop();expect(controller.state).toBe('stopped');
 });
 it('handles an Android system-engine error callback without an unhandled exception',async()=>{
  f.platform.OS='android';f.native.mockReturnValueOnce(null);f.speech.getAvailableVoicesAsync.mockResolvedValueOnce([{identifier:'system'}]);
  f.speech.speak.mockImplementationOnce((_text,options)=>options.onError());
  const controller=new ReadoutController(deviceSpeechDriver());await expect(controller.play(['One.'])).resolves.toBeUndefined();expect(controller.state).toBe('error');await controller.stop();expect(controller.state).toBe('stopped');
 });
 it('iOS explicitly selects an installed voice and exposes OS pause/resume',async()=>{f.platform.OS='ios';f.speech.getAvailableVoicesAsync.mockResolvedValueOnce([{identifier:'installed-voice'}]);const driver=deviceSpeechDriver();expect(await driver.available()).toBe(true);driver.speak('Safe.',1,vi.fn(),vi.fn());expect(f.speech.speak).toHaveBeenCalledWith('Safe.',expect.objectContaining({voice:'installed-voice'}));await driver.pause?.();await driver.resume?.();expect(f.speech.pause).toHaveBeenCalledOnce();expect(f.speech.resume).toHaveBeenCalledOnce();});
});
