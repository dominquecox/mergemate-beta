import {afterEach,describe,it,expect,vi} from 'vitest';
import {RequestCache} from '../src/api/request-cache';
import {makeClient,jsonResponse,USER} from './helpers';

afterEach(()=>vi.useRealTimers());
describe('bounded requests and session memory',()=>{
  it('coalesces ten rapid authenticated GETs into one parsed response',async()=>{
    let release:()=>void=()=>{};
    const gate=new Promise<void>(resolve=>{release=resolve;});
    const {client,calls}=makeClient(async()=>{await gate;return jsonResponse(USER);});
    const reads=Array.from({length:10},()=>client.getMe());
    await vi.waitFor(()=>expect(calls).toHaveLength(1));release();
    expect(await Promise.all(reads)).toHaveLength(10);expect(calls).toHaveLength(1);
  });
  it('coalesces ten repeated done actions',async()=>{
    let release:()=>void=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;});
    const {client,calls}=makeClient(async req=>{if(req.path==='/auth/csrf')return jsonResponse({csrfToken:'fixture'});await gate;return new Response(null,{status:204});});
    const writes=Array.from({length:10},()=>client.markNotificationDone('opaque-id'));
    await vi.waitFor(()=>expect(calls.filter(c=>c.method==='POST')).toHaveLength(1));release();await Promise.all(writes);
    expect(calls.filter(c=>c.method==='POST')).toHaveLength(1);
  });
  it('keeps filters separate, reuses a recent page and clears on logout',async()=>{
    const {client,calls}=makeClient(req=>req.path==='/auth/csrf'?jsonResponse({csrfToken:'fixture'}):req.path==='/auth/logout'?new Response(null,{status:204}):jsonResponse({items:[],nextCursor:null}));
    await client.getNotificationPage('all');await client.getNotificationPage('all');await client.getNotificationPage('review');
    expect(calls).toHaveLength(2);await client.logout();await client.getNotificationPage('all');
    expect(calls.filter(c=>c.path==='/notifications?filter=all')).toHaveLength(2);
  });
  it('serves stale briefly, refreshes once and expires',async()=>{
    vi.useFakeTimers();const cache=new RequestCache();let value=0;const load=vi.fn(async()=>++value);
    expect(await cache.run('page',load,1000)).toBe(1);
    vi.advanceTimersByTime(1001);expect(await cache.run('page',load,1000)).toBe(1);
    await Promise.resolve();await Promise.resolve();expect(load).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2001);expect(await cache.run('page',load,1000)).toBe(3);
  });
  it('never returns or caches data from before sign-out and permits retry after failure',async()=>{
    const cache=new RequestCache();let release:(value:string)=>void=()=>{};
    const old=cache.run('private',()=>new Promise<string>(resolve=>{release=resolve;}),1000);
    await Promise.resolve();cache.clear();release('old account data');await expect(old).rejects.toThrow('Session changed');
    await expect(cache.run('private',async()=>{throw new Error('offline');},1000)).rejects.toThrow('offline');
    expect(await cache.run('private',async()=>'new account data',1000)).toBe('new account data');
  });
});
