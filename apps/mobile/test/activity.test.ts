import {describe,it,expect} from 'vitest';
import {relativeTime,activityAction} from '../src/format/activity';

describe('activity metadata',()=>{
  it('formats valid ages without negative or invalid timestamps',()=>{
    const now=Date.parse('2026-10-27T12:00:00Z');
    expect(relativeTime('2026-10-27T11:25:00Z',now)).toBe('35m');
    expect(relativeTime('2026-10-27T10:00:00Z',now)).toBe('2h');
    expect(relativeTime('2026-10-26T10:00:00Z',now)).toBe('1d');
    expect(relativeTime('2026-10-28T10:00:00Z',now)).toBe('now');
    expect(relativeTime('invalid',now)).toBe('Time unavailable');
  });
  it('uses only the activity information supplied by the inbox contract',()=>{
    expect(activityAction('review')).toBe('authored a pull request · review requested');
    expect(activityAction('mention')).toBe('authored a pull request · mentions you');
    expect(activityAction('mine')).toBe('authored this pull request');
  });
});
