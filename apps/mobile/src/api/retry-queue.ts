import {ApiClientError,messageForCode} from './errors';

/** Bounded per-client GET retries. Never retains bodies or credentials and never persists to disk. */
export class GetRetryQueue {
 private generation=0;
 private pending=new Map<AbortController,()=>void>();
 clear(){this.generation++;for(const [controller,wake] of this.pending){controller.abort();wake();}this.pending.clear();}
 async run<T>(load:(signal:AbortSignal)=>Promise<T>,caller?:AbortSignal):Promise<T>{
  if(this.pending.size>=16) return load(caller??new AbortController().signal);
  const generation=this.generation,controller=new AbortController();
  let wake=()=>{};
  const cancel=()=>{controller.abort();wake();};
  if(caller?.aborted)cancel();else caller?.addEventListener('abort',cancel,{once:true});
  this.pending.set(controller,()=>wake());
  const assert=()=>{if(controller.signal.aborted||generation!==this.generation)throw new ApiClientError('cancelled',messageForCode('cancelled'));};
  try{
   for(let attempt=0;;attempt++){
    assert();
    try{const value=await load(controller.signal);assert();return value;}
    catch(error){
     assert();
     const retryable=error instanceof ApiClientError&&(error.code==='network'||error.code==='timeout'||error.status===429||error.status===502||error.status===503||error.status===504);
     if(!retryable||attempt>=2)throw error;
     const delay=Math.max(250*2**attempt,(error.retryAfterSeconds??0)*1000);
     // Long server cooldowns are reported to the user, never retried early.
     if(delay>30000)throw error;
     await new Promise<void>(resolve=>{const timer=setTimeout(()=>{wake=()=>{};resolve();},delay);wake=()=>{clearTimeout(timer);resolve();};});
    }
   }
  }finally{caller?.removeEventListener('abort',cancel);this.pending.delete(controller);}
 }
}
