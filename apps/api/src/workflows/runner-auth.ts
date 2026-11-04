import { z } from 'zod';
import type { Deps,Env } from '../env';
import { ApiError } from '../errors';
import { timingSafeEqual } from '../lib/crypto';
import { readBoundedBody } from '../lib/bounded-body';

const RunnerClaims=z.object({v:z.literal(1),sub:z.string().regex(/^[a-z\d_-]{1,100}$/i),gen:z.number().int().positive(),repositories:z.array(z.string().regex(/^[a-z\d-]+\/[\w.-]+$/i)).min(1).max(10),iat:z.number().int().positive(),exp:z.number().int().positive(),jti:z.string().regex(/^[a-z\d_-]{16,100}$/i)}).strict();
export type RunnerClaims=z.infer<typeof RunnerClaims>;
const encoder=new TextEncoder();
const decode=(value:string)=>{if(!/^[A-Za-z\d_-]+$/.test(value))throw new ApiError('unauthorized','Runner authentication required.');const normalized=value.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(value.length/4)*4,'=');try{return Uint8Array.from(atob(normalized),c=>c.charCodeAt(0));}catch{throw new ApiError('unauthorized','Runner authentication required.');}};
const encode=(value:Uint8Array)=>btoa(String.fromCharCode(...value)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
const json=<T>(value:Uint8Array):T=>{try{return JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:false}).decode(value)) as T;}catch{throw new ApiError('unauthorized','Runner authentication required.');}};
const runnerKey=async(secret:string,usage:('sign'|'verify')[])=>crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,usage);

export async function signRunnerCredential(secret:string,claims:RunnerClaims):Promise<string>{
 if(secret.length<32)throw new Error('Runner signing key must contain at least 32 characters.');
 const value=RunnerClaims.parse({...claims,repositories:[...new Set(claims.repositories.map(repo=>repo.toLowerCase()))]}),header=encode(encoder.encode(JSON.stringify({alg:'HS256',typ:'MMR',kid:'v1'}))),payload=encode(encoder.encode(JSON.stringify(value))),input=`${header}.${payload}`;
 return `${input}.${encode(new Uint8Array(await crypto.subtle.sign('HMAC',await runnerKey(secret,['sign']),encoder.encode(input))))}`;
}

export async function verifyRunnerCredential(env:Env,authorization:string|undefined,runnerId:string,now:Date):Promise<RunnerClaims>{
 const secret=env.WORKFLOW_RUNNER_SIGNING_KEY;
 if(!secret||secret.length<32||!authorization?.startsWith('Bearer '))throw new ApiError('unauthorized','Runner authentication required.');
 const parts=authorization.slice(7).split('.');if(parts.length!==3||parts.some(part=>part.length>4096))throw new ApiError('unauthorized','Runner authentication required.');
 const [headerPart,payloadPart,signaturePart]=parts as [string,string,string],header=json<{alg?:string;typ?:string;kid?:string}>(decode(headerPart));
 if(header.alg!=='HS256'||header.typ!=='MMR'||header.kid!=='v1')throw new ApiError('unauthorized','Runner authentication required.');
 const expected=new Uint8Array(await crypto.subtle.sign('HMAC',await runnerKey(secret,['sign']),encoder.encode(`${headerPart}.${payloadPart}`))),actual=decode(signaturePart);
 if(!timingSafeEqual(encode(actual),encode(expected)))throw new ApiError('unauthorized','Runner authentication required.');
 const result=RunnerClaims.safeParse(json<unknown>(decode(payloadPart)));if(!result.success)throw new ApiError('unauthorized','Runner authentication required.');
 const claims={...result.data,repositories:[...new Set(result.data.repositories.map(repo=>repo.toLowerCase()))]},seconds=Math.floor(now.getTime()/1000);
 if(claims.sub!==runnerId||claims.iat>seconds+60||claims.exp<=seconds||claims.exp-claims.iat>30*86400)throw new ApiError('unauthorized','Runner credential is expired, mismatched or outside rotation policy.');
 return claims;
}

const accessKeys=new Map<string,{key:CryptoKey;expires:number}>();
export async function verifyAccessAssertion(env:Env,deps:Deps,assertion:string|undefined):Promise<void>{
 const audience=env.CF_ACCESS_AUD,configured=env.CF_ACCESS_TEAM_DOMAIN;
 if(!audience||!configured||!assertion)throw new ApiError('unauthorized','Cloudflare Access service authentication required.');
 let origin:URL;try{origin=new URL(configured);}catch{throw new ApiError('misconfigured','Cloudflare Access validation is not configured.');}
 if(origin.protocol!=='https:'||origin.username||origin.password||origin.port||origin.pathname!=='/'||origin.search||origin.hash)throw new ApiError('misconfigured','Cloudflare Access validation is not configured.');
 const parts=assertion.split('.');if(parts.length!==3||parts.some(part=>part.length>8192))throw new ApiError('unauthorized','Cloudflare Access service authentication required.');
 const [headerPart,payloadPart,signaturePart]=parts as [string,string,string],header=json<{alg?:string;kid?:string}>(decode(headerPart)),payload=json<{aud?:string|string[];iss?:string;exp?:number;nbf?:number}>(decode(payloadPart));
 if(header.alg!=='RS256'||!header.kid||typeof payload.exp!=='number'||typeof payload.iss!=='string')throw new ApiError('unauthorized','Cloudflare Access service authentication required.');
 const seconds=Math.floor(deps.now().getTime()/1000),audiences=Array.isArray(payload.aud)?payload.aud:[payload.aud];
 if(!audiences.includes(audience)||![origin.origin,`${origin.origin}/`].includes(payload.iss)||payload.exp<=seconds||(payload.nbf??0)>seconds+60)throw new ApiError('unauthorized','Cloudflare Access service authentication required.');
 const cacheKey=`${origin.origin}:${header.kid}`,cached=accessKeys.get(cacheKey);let key=cached&&cached.expires>seconds?cached.key:undefined;
 if(!key){
  const response=await deps.fetch(`${origin.origin}/cdn-cgi/access/certs`,{redirect:'manual',headers:{accept:'application/json'}});if(response.status>=300&&response.status<400){await response.body?.cancel().catch(()=>undefined);throw new ApiError('upstream_unavailable','Cloudflare Access keys redirected; redirects are not followed.',{},`access_certs ${response.status}`);}if(!response.ok)throw new ApiError('upstream_unavailable','Cloudflare Access keys are unavailable.');
  const raw=await readBoundedBody(response,131072);let keys:unknown;try{keys=JSON.parse(new TextDecoder().decode(raw));}catch{throw new ApiError('upstream_unavailable','Cloudflare Access keys are invalid.');}
  const match=z.object({keys:z.array(z.record(z.string(),z.unknown())).max(20)}).safeParse(keys);if(!match.success)throw new ApiError('upstream_unavailable','Cloudflare Access keys are invalid.');
  const jwk=match.data.keys.find(item=>item.kid===header.kid&&item.kty==='RSA'&&item.alg==='RS256');if(!jwk)throw new ApiError('unauthorized','Cloudflare Access service authentication required.');
  try{key=await crypto.subtle.importKey('jwk',jwk as unknown as JsonWebKey,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);}catch{throw new ApiError('upstream_unavailable','Cloudflare Access keys are invalid.');}
  accessKeys.set(cacheKey,{key,expires:seconds+300});
 }
 if(!await crypto.subtle.verify({name:'RSASSA-PKCS1-v1_5'},key,decode(signaturePart),encoder.encode(`${headerPart}.${payloadPart}`)))throw new ApiError('unauthorized','Cloudflare Access service authentication required.');
}

export async function assertRunnerEnrollment(env:Env,claims:RunnerClaims,runnerId:string,allowEnrollment=false):Promise<void>{
 if(!env.DB)throw new ApiError('misconfigured','Workflow storage unavailable.');
 const row=await env.DB.prepare('SELECT credential_generation,credential_jti,credential_expires_at,revoked_at FROM workflow_runners WHERE id=?').bind(runnerId).first<{credential_generation:number;credential_jti:string|null;credential_expires_at:string|null;revoked_at:string|null}>();
 if(!row){if(allowEnrollment)return;throw new ApiError('unauthorized','Runner identity is not enrolled.');}
 if(row.revoked_at||row.credential_generation>claims.gen||row.credential_generation===claims.gen&&(row.credential_jti!==claims.jti||row.credential_expires_at!==new Date(claims.exp*1000).toISOString())||row.credential_generation<claims.gen&&!allowEnrollment)throw new ApiError('unauthorized','Runner identity is revoked, stale or not enrolled.');
}

export async function authorizeExecutor(env:Env,deps:Deps,authorization:string|undefined,origin:string|undefined,accessAssertion:string|undefined,runnerId:string,allowEnrollment=false):Promise<RunnerClaims>{
 if(origin)throw new ApiError('unauthorized','Runner authentication required.');
 await verifyAccessAssertion(env,deps,accessAssertion);
 const claims=await verifyRunnerCredential(env,authorization,runnerId,deps.now());
 await assertRunnerEnrollment(env,claims,runnerId,allowEnrollment);
 return claims;
}
