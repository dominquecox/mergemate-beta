import {describe,expect,it} from 'vitest';
import {activityDay} from '../src/format/activityDays';
describe('day grouped notification audit',()=>{
 it('uses calendar boundaries through the fall-back hour',()=>{
  const now=new Date('2026-11-02T04:30:00Z');
  expect(activityDay('2026-11-01T05:30:00Z',now,'America/New_York')).toBe('Today');
  expect(activityDay('2026-10-31T23:00:00Z',now,'America/New_York')).toBe('Yesterday');
  expect(activityDay('2026-10-28T12:00:00Z',now,'America/New_York')).toBe('Last Week');
 });
 it('handles spring-forward and UTC midnight independently',()=>{
  const now=new Date('2026-03-09T03:30:00Z');
  expect(activityDay('2026-03-08T06:30:00Z',now,'America/New_York')).toBe('Today');
  expect(activityDay('2026-03-08T06:30:00Z',now,'UTC')).toBe('Yesterday');
  expect(activityDay('invalid',now,'UTC')).toBe('Time unavailable');
 });
});
