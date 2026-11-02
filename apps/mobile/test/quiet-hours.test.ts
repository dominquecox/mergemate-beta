import {describe,it,expect} from 'vitest';
import {Settings,QuietHours} from '@mergemate/contracts';
describe('quiet schedule settings boundary',()=>{
 it('round-trips enabled overnight schedules and explicitly disabled schedules',()=>{
  const enabled={notifications:{review:true,mention:true,mine:true},aiSummaries:true,quietHours:{start:'22:00',end:'07:00',timeZone:'America/New_York'}};
  expect(Settings.parse(enabled)).toEqual(enabled);
  expect(Settings.parse({...enabled,quietHours:null}).quietHours).toBeNull();
 });
 it.each([{start:'24:00',end:'07:00',timeZone:'UTC'},{start:'22:00',end:'22:00',timeZone:'UTC'},{start:'22:00',end:'07:00',timeZone:'made-up/zone'}])('refuses invalid wall-clock schedules %j',value=>expect(QuietHours.safeParse(value).success).toBe(false));
});
