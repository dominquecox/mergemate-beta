import {describe,it,expect,vi} from 'vitest';
import {nativeAuthReturn,nativeAuthParams,SignInCompletions} from '../src/auth/github-return';
describe('native browser PKCE handoff',()=>{
 it('relays only transient code/state and handles denial without copying credentials',()=>{
  expect(nativeAuthReturn({code:'a+b',state:'s'})).toBe('mergemate://auth/callback?code=a%2Bb&state=s');
  expect(nativeAuthParams('mergemate://auth/callback?code=a%2Bb&state=s')).toEqual({code:'a+b',state:'s'});
  expect(nativeAuthReturn({error:'access_denied',state:'s'})).toContain('error=access_denied');
  expect(nativeAuthReturn({code:['a'],state:'s'})).toBeNull();
  expect(nativeAuthParams('mergemate://auth/callback?code=a&code=b&state=s')).toBeNull();
 });
 it('shares one exchange across cold/warm callback mounts and browser-session completion',async()=>{
  const flows=new SignInCompletions();let finish!:(ok:boolean)=>void;
  const exchange=vi.fn(()=>new Promise<boolean>(resolve=>{finish=resolve;}));
  const first=flows.run('code','state',exchange),second=flows.run('code','state',exchange);
  expect(first).toBe(second);expect(exchange).toHaveBeenCalledTimes(1);finish(true);
  expect(await first).toBe(true);expect(await flows.run('code','state',exchange)).toBe(true);expect(exchange).toHaveBeenCalledTimes(1);
  flows.clear();expect(flows.has('code','state')).toBe(false);
  const newer=vi.fn(async()=>false);expect(await flows.run('code','state',newer)).toBe(false);expect(newer).toHaveBeenCalledOnce();
 });
});

import {openNativeGithub} from '../src/auth/native-browser';
it('opens a native auth session with the registered return and validates its response',async()=>{
 const browser=vi.fn(async()=>({type:'success',url:'mergemate://auth/callback?code=code&state=expected'}));
 expect(await openNativeGithub('https://github.com/login/oauth/authorize','expected',browser)).toEqual({code:'code',state:'expected'});
 expect(browser).toHaveBeenCalledWith('https://github.com/login/oauth/authorize','mergemate://auth/callback');
 expect(await openNativeGithub('https://github.com/login/oauth/authorize','expected',async()=>({type:'cancel'}))).toBeNull();
 await expect(openNativeGithub('https://github.com/login/oauth/authorize','other',browser)).rejects.toThrow('Invalid sign-in return');
});

import {makeClient,jsonResponse,NOW,USER} from './helpers';
it.each(['ios','android'] as const)('opts %s into the browser relay and persists one native session credential',async platform=>{
 const fixture=makeClient(req=>req.path==='/auth/github/start'?jsonResponse({authorizeUrl:'https://github.com/login/oauth/authorize',state:'expected'}):jsonResponse({user:USER,session:{token:'fixture-native-session',expiresAt:NOW}}),{platform:'native',nativePlatform:platform});
 await fixture.client.startGithubAuth(platform,'c'.repeat(43));expect(fixture.calls[0]?.body).toMatchObject({platform,nativeBrowser:true});
 const flows=new SignInCompletions(),exchange=()=>fixture.client.completeGithubAuth('code','expected','v'.repeat(43)).then(()=>true);
 await Promise.all([flows.run('code','expected',exchange),flows.run('code','expected',exchange)]);
 expect(fixture.store.token).toBe('fixture-native-session');expect(fixture.calls.filter(c=>c.path==='/auth/github/callback')).toHaveLength(1);
});
