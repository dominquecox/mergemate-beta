import {describe,it,expect,vi} from 'vitest';
import {prExecutiveNarration,triageExecutiveNarration} from '../src/readout/narration';
import {ReadoutController,type SpeechDriver} from '../src/readout/controller';
import {seedPrDetails} from '../src/api/mock-data';
const details=seedPrDetails();
describe('private executive commute narration',()=>{
 it('bounds single-PR speech to32 words and excludes code, credentials and links',()=>{const detail=Object.values(details)[0]!;const speech=prExecutiveNarration({...detail,title:'Bearer secret_value',files:[]});expect(speech.join(' ').split(/\s+/).length).toBeLessThanOrEqual(32);expect(speech.join(' ')).not.toMatch(/secret_value|https?:|Bearer|sk_live_/i);});
 it('narrates loaded PR counts with known risk signals, not invented timings',()=>{const result=triageExecutiveNarration([{prRef:'org/repo#7',agent:'Jules',level:'safe',title:'Scaffold Worker'},{prRef:'org/repo#412',agent:'Claude',level:'blocked',title:'Changes payments'}]).join(' ');expect(result).toContain('2 loaded pull requests');expect(result).toContain('PR 412');expect(result).toContain('blocked');expect(result).not.toContain('org/repo');});
 it('uses the existing sentence controller for pause, rate changes and stop cancellation',async()=>{const completions:(()=>void)[]=[];const driver:SpeechDriver={available:vi.fn(async()=>true),stop:vi.fn(async()=>{}),speak:vi.fn((_t,_r,done)=>completions.push(done))};const controller=new ReadoutController(driver);await controller.play(['One safe sentence.','Second sentence.']);await controller.pause();await controller.speed(1.5);await controller.resume();expect(controller.rate).toBe(1.5);await controller.stop();completions.forEach(f=>f());expect(controller.state).toBe('stopped');expect(driver.speak).toHaveBeenCalledTimes(2);});
});
