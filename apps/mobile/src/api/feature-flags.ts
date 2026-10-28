import {FeatureFlags} from '@mergemate/contracts';
export const disabledFeatureFlags = ():FeatureFlags => ({voice_readout:false,voice_notes:false,highlight:false});
/** Public switches only. Never serve stale enabled values after expiry or a failed refresh. */
export class FeatureFlagCache {
  private value:FeatureFlags|undefined;
  private until=0;
  private pending:Promise<FeatureFlags>|undefined;
  private generation=0;
  constructor(private readonly load:()=>Promise<unknown>){}
  clear(){this.generation++;this.value=undefined;this.until=0;this.pending=undefined;}
  get():Promise<FeatureFlags>{
    if(this.value && Date.now()<this.until)return Promise.resolve({...this.value});
    if(this.pending)return this.pending;
    const generation=this.generation;
    const pending=Promise.resolve().then(this.load).then(raw=>{const parsed=FeatureFlags.safeParse(raw);return parsed.success?parsed.data:disabledFeatureFlags();},disabledFeatureFlags).then(value=>{
      if(generation!==this.generation)return disabledFeatureFlags();
      this.value=value;this.until=Date.now()+60_000;return {...value};
    }).finally(()=>{if(this.pending===pending)this.pending=undefined;});
    this.pending=pending;return pending;
  }
}
