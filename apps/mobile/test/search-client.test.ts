import {describe,it,expect,vi} from 'vitest';
import {PrSearchFilters} from '@mergemate/contracts';
import {makeClient,jsonResponse} from './helpers';
import {mergeSearchRows} from '../src/search/rows';
const page={items:[],nextCursor:null,candidates:0,incomplete:false,capped:false};
describe('PR search client',()=>{
 it('sends all filters and cursor to the API rather than filtering Inbox locally',async()=>{
  const {client,calls}=makeClient(()=>jsonResponse(page));const filters=PrSearchFilters.parse({query:'Fix auth',repo:'acme/api',author:'fixture',risk:'high',from:'2026-10-26',to:'2026-10-27'});expect(await client.searchPrs(filters,'opaque-cursor')).toEqual(page);const url=new URL(calls[0]?.url??'');expect(url.pathname).toBe('/v1/search/prs');expect(Object.fromEntries(url.searchParams)).toEqual({...filters,cursor:'opaque-cursor'});
 });
 it('rejects invalid filter input before transport',async()=>{const {client,calls}=makeClient(()=>jsonResponse(page));await expect(client.searchPrs({...PrSearchFilters.parse({}),from:'2026-02-30'})).rejects.toThrow();expect(calls).toEqual([]);});
 it('cancels only its own in-flight request so another search can finish',async()=>{
  const {client,calls}=makeClient(req=>new Promise((resolve,reject)=>{if(req.path.includes('query=old'))req.signal?.addEventListener('abort',()=>reject(new Error('fixture aborted')),{once:true});else resolve(jsonResponse(page));}));const abort=new AbortController();const old=client.searchPrs(PrSearchFilters.parse({query:'old'}),null,abort.signal);const rejection=expect(old).rejects.toMatchObject({code:'timeout'});await vi.waitFor(()=>expect(calls.length).toBe(1));abort.abort();expect(await client.searchPrs(PrSearchFilters.parse({query:'new'}),null,new AbortController().signal)).toEqual(page);await rejection;expect(calls[0]?.signal?.aborted).toBe(true);
 });
 it('keeps newer revisions across pages and orders equal timestamps by opaque ID',()=>{const row=(id:string,updatedAt:string)=>({id,repo:'acme/api',number:1,title:'Fixture',author:'fixture',status:'open' as const,updatedAt});expect(mergeSearchRows([row('b','2026-10-27T10:00:00Z'),row('a','2026-10-27T10:00:00Z'),row('b','2026-10-26T10:00:00Z')]).map(r=>r.id)).toEqual(['a','b']);});
});
