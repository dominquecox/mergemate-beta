import {isVerifiedCallbackUrl,validOAuthParams} from '../navigation/links';
export const NATIVE_AUTH_RETURN='mergemate://auth/callback';

/** Transport only: no token or verifier ever enters the browser relay URL. */
export function nativeAuthReturn(params:{code?:unknown;state?:unknown;error?:unknown}):string|null {
 if(!validOAuthParams(params))return null;
 const query=new URLSearchParams();
 if(typeof params.error==='string')query.set('error',params.error);
 else if(typeof params.code==='string')query.set('code',params.code);
 if(typeof params.state==='string')query.set('state',params.state);
 return `${NATIVE_AUTH_RETURN}?${query}`;
}
export function nativeAuthParams(raw:string):{code?:string;state?:string;error?:string}|null {
 if(!isVerifiedCallbackUrl(raw))return null;
 const url=new URL(raw);
 const result: {code?:string;state?:string;error?:string}={};
 for(const key of ['code','state','error'] as const){const value=url.searchParams.get(key);if(value!==null)result[key]=value;}
 return result;
}

/** One completion per live intent, including duplicate browser-session and Linking deliveries. */
export class SignInCompletions {
 private current:{code:string;state:string;promise:Promise<boolean>}|undefined;
 clear(){this.current=undefined;}
 has(code:string,state:string){return this.current?.code===code&&this.current.state===state;}
 run(code:string,state:string,complete:()=>Promise<boolean>):Promise<boolean>{
  if(this.current?.code===code&&this.current.state===state)return this.current.promise;
  const promise=complete();this.current={code,state,promise};return promise;
 }
}
