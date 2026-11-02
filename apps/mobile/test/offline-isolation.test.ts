import {describe,it,expect,vi,afterEach} from 'vitest';
import {GetRetryQueue} from '../src/api/retry-queue';
import {RequestCache} from '../src/api/request-cache';
import {ApiClientError} from '../src/api/errors';
import {parseRetryAfter} from '../src/api/http-types';
afterEach(()=>vi.useRealTimers());
describe('offline reads and session isolation',()=>{
 it('retries bounded reads with exponential backoff and respects Retry-After',async()=>{
  vi.useFakeTimers();const queue=new GetRetryQueue();
  const load=vi.fn().mockRejectedValueOnce(new ApiClientError('network','offline')).mockRejectedValueOnce(new ApiClientError('rate_limited','wait',{status:429,retryAfterSeconds:2})).mockResolvedValue('new');
  const result=queue.run(load);await vi.advanceTimersByTimeAsync(249);expect(load).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);expect(load).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1999);expect(load).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1);expect(await result).toBe('new');
 });
 it('cancels sleeping requests on logout and rejects late old-user completions',async()=>{
  vi.useFakeTimers();const queue=new GetRetryQueue();const load=vi.fn().mockRejectedValue(new ApiClientError('network','offline'));
  const result=queue.run(load).catch(e=>e.code);await vi.advanceTimersByTimeAsync(0);queue.clear();expect(await result).toBe('cancelled');await vi.runAllTimersAsync();expect(load).toHaveBeenCalledTimes(1);
  const cache=new RequestCache();let finish!:(v:string)=>void;const old=cache.run('private',()=>new Promise<string>(resolve=>{finish=resolve;}),5000).catch(e=>e.message);
  await Promise.resolve();cache.clear();finish('old-user');expect(await old).toBe('Session changed.');expect(await cache.run('private',async()=>'new-user',5000)).toBe('new-user');
 });
 it('does not retry forbidden or long cooldown responses and parses HTTP dates',async()=>{
  const load=vi.fn().mockRejectedValue(new ApiClientError('forbidden','no',{status:403}));await expect(new GetRetryQueue().run(load)).rejects.toMatchObject({code:'forbidden'});expect(load).toHaveBeenCalledTimes(1);
  expect(parseRetryAfter('Mon, 02 Nov 2026 10:00:05 GMT',Date.parse('2026-11-02T10:00:00Z'))).toBe(5);
 });
});
