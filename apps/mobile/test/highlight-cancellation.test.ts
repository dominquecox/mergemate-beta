import {describe,it,expect,vi} from 'vitest';
import {makeClient,jsonResponse} from './helpers';
describe.each(['web','native'] as const)('Highlight cancellation over %s',platform=>{
 it('cancels an active upload using the native-compatible abort API',async()=>{
  const {client,calls}=makeClient(req=>req.path==='/auth/csrf'?jsonResponse({csrfToken:'fixture-csrf'}):req.url.startsWith('blob:')?new Response(new Blob([new Uint8Array([137,80,78,71])])):new Promise<Response>((_resolve,reject)=>{req.signal?.addEventListener('abort',()=>reject(new DOMException('Fixture cancel','AbortError')));}),{platform,token:'fixture-session'});
  const abort=new AbortController();const pending=client.analyzeHighlight(platform==='web'?'blob:fixture':'file:///cache/ImagePicker/fixture.png','review','image/png',abort.signal);const rejected=expect(pending).rejects.toMatchObject({code:'cancelled'});
  await vi.waitFor(()=>expect(calls.some(call=>call.path==='/highlight')).toBe(true));abort.abort();await rejected;expect(calls.at(-1)?.signal?.aborted).toBe(true);
 });
});
