import {describe,it,expect,vi} from 'vitest';
import {makeClient,jsonResponse,errorResponse,USER,NOW} from './helpers';
function deferred<T>(){let resolve:(value:T)=>void=()=>{throw new Error('Not initialized');};const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve:(value:T)=>resolve(value)};}
describe('device cleanup belongs to confirmed account deletion',()=>{
 it('runs local erasure only after confirmed server success',async()=>{
  const erase=vi.fn(async()=>{});let success=false;const f=makeClient(()=>success?new Response(null,{status:204}):errorResponse('upstream_unavailable',502),{platform:'native',token:'fixture-token-for-deletion',onAccountDeleted:erase});
  await expect(f.client.deleteAccount()).rejects.toMatchObject({code:'upstream_unavailable'});expect(erase).not.toHaveBeenCalled();expect(f.store.token).not.toBeNull();success=true;await f.client.deleteAccount();expect(erase).toHaveBeenCalledOnce();expect(f.store.token).toBeNull();
 });
 it.each([200,202])('does not erase local data for an unexpected successful status%s',async status=>{
  const erase=vi.fn(async()=>{});const f=makeClient(()=>new Response('unexpected confirmation',{status}),{platform:'native',token:'fixture-token-for-deletion',onAccountDeleted:erase});
  await expect(f.client.deleteAccount()).rejects.toMatchObject({code:'parse_failed',status});expect(erase).not.toHaveBeenCalled();expect(f.store.token).toBe('fixture-token-for-deletion');
 });
 it('finishes an in-flight deletion before a newer sign-in adopts its token',async()=>{
  const began=deferred<void>(),reply=deferred<Response>(),order:string[]=[];const f=makeClient(req=>{if(req.method==='DELETE'){began.resolve();return reply.promise;}order.push('sign-in');return jsonResponse({session:{token:'new-fixture-account-token',expiresAt:NOW},user:{...USER,id:'new-user'}});},{platform:'native',token:'old-fixture-account-token',onAccountDeleted:async()=>{order.push('erase');}});
  const deletion=f.client.deleteAccount();await began.promise;const next=f.client.completeGithubAuth('code','state','v'.repeat(43));reply.resolve(new Response(null,{status:204}));await deletion;await next;expect(order).toEqual(['erase','sign-in']);expect(f.store.token).toBe('new-fixture-account-token');
 });
 it('reports device erasure failure without claiming the server account still exists',async()=>{
  const f=makeClient(()=>new Response(null,{status:204}),{platform:'native',token:'fixture-token-for-deletion',onAccountDeleted:async()=>{throw new Error('Device storage failure');}});
  await expect(f.client.deleteAccount()).rejects.toMatchObject({code:'local_cleanup_incomplete',status:204});expect(f.store.token).toBeNull();
 });
});
