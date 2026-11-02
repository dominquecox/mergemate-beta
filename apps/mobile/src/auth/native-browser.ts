import {NATIVE_AUTH_RETURN,nativeAuthParams} from './github-return';
type BrowserResult={type:string;url?:string};
type OpenSession=(authorizeUrl:string,returnUrl:string)=>Promise<BrowserResult>;
/** Uses ASWebAuthenticationSession on iOS and an auth custom tab on Android. */
export async function openNativeGithub(authorizeUrl:string,state:string,open:OpenSession=async(url,returnUrl)=>{
 const browser=require('expo-web-browser') as typeof import('expo-web-browser');
 return browser.openAuthSessionAsync(url,returnUrl);
}){
 const result=await open(authorizeUrl,NATIVE_AUTH_RETURN);
 if(result.type!=='success')return null;
 const params=result.url?nativeAuthParams(result.url):null;
 if(!params||params.state!==state)throw new Error('Invalid sign-in return');
 return params;
}
