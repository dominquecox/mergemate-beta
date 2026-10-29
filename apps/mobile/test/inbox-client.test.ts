import {describe,it,expect,vi} from 'vitest';
import {mergePageItems} from '../src/hooks/usePagedList';
import {makeClient,jsonResponse} from './helpers';
const op='8e49d33b-7dd4-4e19-aa65-43bab16cad16';
const receipt={operationId:op,doneAt:'2026-10-27T10:00:00Z',snoozedUntil:null,updatedAt:'2026-10-27T12:00:00Z'};
const input={operationId:op,expectedOperationId:null,action:'done' as const,observedUpdatedAt:'2026-10-27T10:00:00Z'};
describe('Inbox client contracts',()=>{
 it.each(['web','native'] as const)('deduplicates rapid %s state actions with an unchanged receipt and expected predecessor',async platform=>{
  let release:()=>void=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;});const {client,calls}=makeClient(async req=>req.path==='/auth/csrf'?jsonResponse({csrfToken:'fixture'}):(await gate,jsonResponse(receipt)),{platform,token:'fixture-session'});
  const all=Array.from({length:10},()=>client.mutateInboxItem('opaque-id',input));await vi.waitFor(()=>expect(calls.filter(call=>call.method==='POST')).toHaveLength(1));release();expect(await Promise.all(all)).toEqual(Array(10).fill(receipt));expect(calls.at(-1)?.body).toEqual(input);
 });
 it('loads and saves only the selected filter and invalidates its read cache',async()=>{let filter='all';const {client,calls}=makeClient(req=>{if(req.path==='/auth/csrf')return jsonResponse({csrfToken:'fixture'});if(req.method==='PUT')filter='mentions';return jsonResponse({filter});});expect(await client.getInboxPreference()).toEqual({filter:'all'});await client.setInboxPreference('mentions');expect(await client.getInboxPreference()).toEqual({filter:'mentions'});expect(calls.find(call=>call.method==='PUT')?.body).toEqual({filter:'mentions'});});
 it('keeps wake metadata and operation tokens from a live page',async()=>{const {client}=makeClient(()=>jsonResponse({items:[],nextCursor:null,serverTime:'2026-10-27T12:00:00Z',refreshAt:'2026-10-27T12:01:00Z'}));expect(await client.getNotificationPage()).toMatchObject({serverTime:'2026-10-27T12:00:00Z',refreshAt:'2026-10-27T12:01:00Z'});});
 it('keeps a newer revision when an older duplicate crosses page boundaries',()=>{const rows=mergePageItems([{id:'one',updatedAt:'2026-10-27T12:00:00Z',title:'new'},{id:'two',updatedAt:'2026-10-27T11:00:00Z',title:'other'},{id:'one',updatedAt:'2026-10-27T10:00:00Z',title:'old'}]);expect(rows.map(row=>row.title)).toEqual(['new','other']);});
});
