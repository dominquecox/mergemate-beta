import {describe,expect,it} from 'vitest';
import {swipeLane} from '../src/triage/gesture';
describe('triage gesture intent and commit thresholds',()=>{
 it('previews stamps before committing and returns neutral below threshold',()=>{expect(swipeLane(90,0)).toBe('needs_you');expect(swipeLane(90,0,true)).toBeNull();expect(swipeLane(-90,0)).toBe('ignore');expect(swipeLane(0,-90)).toBe('fyi');expect(swipeLane(0,-90,true)).toBeNull();});
 it('commits only dominant left/right/up, never downward or invalid motion',()=>{expect(swipeLane(-121,0,true)).toBe('ignore');expect(swipeLane(121,-10,true)).toBe('needs_you');expect(swipeLane(120,-180,true)).toBe('fyi');expect(swipeLane(5,200,true)).toBeNull();expect(swipeLane(NaN,-110,true)).toBeNull();expect(swipeLane(120,0,true)).toBeNull();});
});
