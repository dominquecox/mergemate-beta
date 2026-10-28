import {afterEach,describe,it,expect,vi} from 'vitest';
import {makeClient,jsonResponse,NOW,USER} from './helpers';
import {hasPendingLogout,setPendingLogout} from '../src/auth/session-events';
import {getInMemoryCsrfToken} from '../src/api/client';
const OLD='tok_'+ 'a'.repeat(24),NEW='tok_'+ 'b'.repeat(24),LATEST='tok_'+ 'c'.repeat(24);
function deferred<T>(){let resolve:(value:T)=>void=()=>{throw new Error('Deferred not initialized');};const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve:(value:T)=>resolve(value)};}
afterEach(()=>{vi.unstubAllGlobals();setPendingLogout(false);});
describe('client session ordering and identity boundaries',()=>{
 it('does not adopt a refresh that finishes after logout intent, and revokes with the old credential',async()=>{
  const started=deferred<void>(),reply=deferred<Response>();const f=makeClient(req=>{if(req.path==='/auth/refresh'){started.resolve();return reply.promise;}return new Response(null,{status:204});},{platform:'native',token:OLD});
  const refresh=f.client.refreshSession();const rejected=expect(refresh).rejects.toMatchObject({code:'unauthorized'});await started.promise;const logout=f.client.logout();reply.resolve(jsonResponse({session:{token:NEW,expiresAt:NOW}}));await rejected;await logout;expect(f.store.token).toBeNull();expect(f.store.sets).toEqual([]);expect(f.calls.find(x=>x.path==='/auth/logout')?.headers.authorization).toBe(`Bearer ${OLD}`);
 });
 it('serializes a new account after logout without an old completion clearing its credentials',async()=>{
  const started=deferred<void>(),reply=deferred<Response>();const f=makeClient(req=>{if(req.path==='/auth/refresh'){started.resolve();return reply.promise;}if(req.path==='/auth/logout')return new Response(null,{status:204});return jsonResponse({session:{token:NEW,expiresAt:NOW},user:{...USER,id:'new-account'}});},{platform:'native',token:OLD});
  const refresh=f.client.refreshSession();const rejected=expect(refresh).rejects.toMatchObject({code:'unauthorized'});await started.promise;const logout=f.client.logout();const next=f.client.completeGithubAuth('code','state','v'.repeat(43));reply.resolve(jsonResponse({session:{token:OLD,expiresAt:NOW}}));await rejected;await logout;expect((await next).user.id).toBe('new-account');expect(f.store.token).toBe(NEW);expect(f.calls.map(x=>x.path)).toEqual(['/auth/refresh','/auth/logout','/auth/github/callback']);
 });
 it('does not adopt an older callback when a later account intent has superseded it',async()=>{
  const started=deferred<void>(),reply=deferred<Response>();let count=0;const f=makeClient(()=>{if(++count===1){started.resolve();return reply.promise;}return jsonResponse({session:{token:LATEST,expiresAt:NOW},user:{...USER,id:'latest-account'}});},{platform:'native'});
  const older=f.client.completeGithubAuth('old','state','v'.repeat(43));const rejected=expect(older).rejects.toMatchObject({code:'unauthorized'});await started.promise;const latest=f.client.completeGithubAuth('new','state2','v'.repeat(43));reply.resolve(jsonResponse({session:{token:NEW,expiresAt:NOW},user:USER}));await rejected;expect((await latest).user.id).toBe('latest-account');expect(f.store.sets).toEqual([LATEST]);
 });
 it('rejects stale private data without firing a logout handler against a newer account',async()=>{
  const started=deferred<void>(),reply=deferred<Response>();const f=makeClient(req=>{if(req.path==='/me'){started.resolve();return reply.promise;}return jsonResponse({session:{token:NEW,expiresAt:NOW},user:{...USER,id:'new-account'}});},{platform:'native',token:OLD});const unauthorized=vi.fn();f.client.setUnauthorizedHandler(unauthorized);
  const old=f.client.getMe();const rejected=expect(old).rejects.toBeDefined();await started.promise;await f.client.completeGithubAuth('code','state','v'.repeat(43));reply.resolve(jsonResponse(USER));await rejected;expect(unauthorized).not.toHaveBeenCalled();expect(f.store.token).toBe(NEW);
 });
 it('rejects an old account response whose JSON finishes after an account switch',async()=>{
  const parsing=deferred<void>(),body=deferred<unknown>();const response=jsonResponse(USER);vi.spyOn(response,'json').mockImplementation(()=>{parsing.resolve();return body.promise;});
  const f=makeClient(req=>req.path==='/me'?response:jsonResponse({session:{token:NEW,expiresAt:NOW},user:{...USER,id:'new-account'}}),{platform:'native',token:OLD});const old=f.client.getMe();const rejected=expect(old).rejects.toMatchObject({code:'unauthorized'});await parsing.promise;await f.client.completeGithubAuth('code','state','v'.repeat(43));body.resolve(USER);await rejected;expect(f.store.token).toBe(NEW);
 });
 it('does not delete a different account after the original deletion intent is superseded',async()=>{
  const started=deferred<void>(),reply=deferred<Response>();const f=makeClient(req=>{if(req.path==='/auth/refresh'){started.resolve();return reply.promise;}return jsonResponse({session:{token:NEW,expiresAt:NOW},user:{...USER,id:'new-account'}});},{platform:'native',token:OLD});const old=f.client.refreshSession();const rejected=expect(old).rejects.toBeDefined();await started.promise;const deletion=f.client.deleteAccount();const cancelled=expect(deletion).rejects.toMatchObject({code:'unauthorized'});const login=f.client.completeGithubAuth('new','state','v'.repeat(43));reply.resolve(jsonResponse({session:{token:OLD,expiresAt:NOW}}));await rejected;await cancelled;await login;expect(f.calls.some(x=>x.method==='DELETE')).toBe(false);expect(f.store.token).toBe(NEW);
 });
 it('uses Android explicitly for native demo requests',async()=>{const f=makeClient(()=>jsonResponse({session:{token:NEW,expiresAt:NOW,demo:true},user:USER}),{platform:'native',nativePlatform:'android',getTurnstileToken:async()=> 'fixture'});await f.client.startDemoSession();expect(f.calls[0]?.body).toEqual({platform:'android',turnstileToken:'fixture'});});
 it('keeps authoritative demo metadata from the API',async()=>{const f=makeClient(()=>jsonResponse({...USER,demo:true}));expect((await f.client.getMe()).demo).toBe(true);});
 it('does not nest a shared cookie lock inside an exclusive refresh/logout mutation',async()=>{
  let exclusive=false;const modes:string[]=[];vi.stubGlobal('navigator',{locks:{request:async(_name:string,options:{mode:string},operation:()=>Promise<unknown>)=>{modes.push(options.mode);if(exclusive)throw new Error('Nested cookie lock');exclusive=options.mode==='exclusive';try{return await operation();}finally{exclusive=false;}}}});
  const f=makeClient(req=>req.path==='/auth/csrf'?jsonResponse({csrfToken:'fixture-csrf'}):req.path==='/auth/refresh'?jsonResponse({session:{expiresAt:NOW,csrfToken:'next-csrf'}}):new Response(null,{status:204}));await f.client.refreshSession();await f.client.logout();expect(modes).toEqual(['exclusive','exclusive']);
 });
 it('keeps an offline sign-out intent until old-cookie revocation or a verified replacement succeeds',async()=>{
  let offline=true;const f=makeClient(req=>{if(req.path==='/auth/csrf')return jsonResponse({csrfToken:'fixture-csrf'});if(req.path==='/auth/logout'){if(offline)throw new TypeError('offline');return new Response(null,{status:204});}return jsonResponse({session:{expiresAt:NOW,csrfToken:'new-csrf'},user:USER});});await expect(f.client.logout()).rejects.toMatchObject({code:'network'});expect(hasPendingLogout()).toBe(true);expect(getInMemoryCsrfToken()).toBeNull();offline=false;await f.client.completeGithubAuth('code','state','v'.repeat(43));expect(hasPendingLogout()).toBe(false);expect(f.calls.filter(x=>x.path==='/auth/logout')).toHaveLength(2);expect(f.store.sets).toEqual([]);
 });
});
