import { z } from 'zod';
import type { Deps,Env } from '../env';
import { ApiError } from '../errors';
import { readBoundedBody } from '../lib/bounded-body';

const encoder=new TextEncoder(),API='https://api.github.com';
const encode=(value:string|Uint8Array)=>{const bytes=typeof value==='string'?encoder.encode(value):value;return btoa(String.fromCharCode(...bytes)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');};
const privateKey=async(value:string)=>{const normalized=value.includes('\\n')?value.replace(/\\n/g,'\n'):value,match=/^-----BEGIN PRIVATE KEY-----\n?([A-Za-z\d+/=\n\r]+)\n?-----END PRIVATE KEY-----$/.exec(normalized.trim()),body=match?.[1];if(!body)throw new ApiError('misconfigured','GitHub App token minting is not configured.');let bytes:Uint8Array;try{bytes=Uint8Array.from(atob(body.replace(/\s/g,'')),c=>c.charCodeAt(0));}catch{throw new ApiError('misconfigured','GitHub App token minting is not configured.');}try{return await crypto.subtle.importKey('pkcs8',bytes,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);}catch{throw new ApiError('misconfigured','GitHub App token minting is not configured.');}};
async function appJwt(env:Env,now:Date){const appId=env.GITHUB_APP_ID,keyValue=env.GITHUB_APP_PRIVATE_KEY;if(!appId||!/^\d{1,20}$/.test(appId)||!keyValue)throw new ApiError('misconfigured','GitHub App token minting is not configured.');const seconds=Math.floor(now.getTime()/1000),header=encode(JSON.stringify({alg:'RS256',typ:'JWT'})),payload=encode(JSON.stringify({iat:seconds-60,exp:seconds+540,iss:appId})),input=`${header}.${payload}`,signature=await crypto.subtle.sign({name:'RSASSA-PKCS1-v1_5'},await privateKey(keyValue),encoder.encode(input));return `${input}.${encode(new Uint8Array(signature))}`;}
async function request<T>(deps:Deps,jwt:string,path:string,schema:z.ZodType<T>,init?:{method:'POST';body:unknown}):Promise<T>{const url=new URL(path,API);if(url.origin!==API)throw new ApiError('misconfigured','GitHub App route is invalid.');const response=await deps.fetch(url,{method:init?.method??'GET',redirect:'error',headers:{accept:'application/vnd.github+json',authorization:`Bearer ${jwt}`,'x-github-api-version':'2022-11-28','user-agent':'MergeMate-Workflow-Token-Minter',...(init?{'content-type':'application/json'}:{})},...(init?{body:JSON.stringify(init.body)}:{})});if(!response.ok)throw new ApiError(response.status===404?'forbidden':'upstream_unavailable','GitHub App installation token is unavailable.');const raw=await readBoundedBody(response,131072);let value:unknown;try{value=JSON.parse(new TextDecoder().decode(raw));}catch{throw new ApiError('upstream_unavailable','GitHub App returned an invalid token response.');}const parsed=schema.safeParse(value);if(!parsed.success)throw new ApiError('upstream_unavailable','GitHub App returned an invalid token response.');return parsed.data;}

export async function mintJobToken(env:Env,deps:Deps,repository:string,repositoryId:number,write=false){
 if(!/^[a-z\d-]+\/[\w.-]+$/i.test(repository)||!Number.isSafeInteger(repositoryId)||repositoryId<1)throw new ApiError('forbidden','Repository identity is invalid.');
 const jwt=await appJwt(env,deps.now()),installation=await request(deps,jwt,`/repos/${repository}/installation`,z.object({id:z.number().int().positive(),app_id:z.number().int().positive().optional()}).passthrough());
 if(env.GITHUB_APP_ID&&installation.app_id!==undefined&&String(installation.app_id)!==env.GITHUB_APP_ID)throw new ApiError('forbidden','Repository belongs to another GitHub App installation.');
 const permission=write?'write':'read',token=await request(deps,jwt,`/app/installations/${installation.id}/access_tokens`,z.object({token:z.string().min(20).max(500).refine(value=>!/[\r\n]/.test(value)),expires_at:z.string(),permissions:z.object({contents:z.literal(permission),pull_requests:z.literal(permission),metadata:z.enum(['read','write']).optional()}).passthrough(),repositories:z.array(z.object({id:z.number().int().positive(),full_name:z.string()}).passthrough()).max(1).optional()}).passthrough(),{method:'POST',body:{repository_ids:[repositoryId],permissions:{contents:permission,pull_requests:permission,metadata:'read'}}});
 const expires=Date.parse(token.expires_at);if(!Number.isFinite(expires)||expires<=deps.now().getTime()+60000||expires>deps.now().getTime()+3700000)throw new ApiError('upstream_unavailable','GitHub App returned an invalid token lifetime.');
 if(token.repositories&&(token.repositories.length!==1||token.repositories[0]?.id!==repositoryId||token.repositories[0]?.full_name.toLowerCase()!==repository))throw new ApiError('forbidden','GitHub App token is not scoped to the exact repository.');
 return {token:token.token,expiresAt:token.expires_at,installationId:installation.id,write};
}

export async function revokeJobToken(deps:Deps,token:string){
 if(!token||/[\r\n]/.test(token))return false;
 try{const response=await deps.fetch(`${API}/installation/token`,{method:'DELETE',redirect:'error',headers:{accept:'application/vnd.github+json',authorization:`Bearer ${token}`,'x-github-api-version':'2022-11-28','user-agent':'MergeMate-Workflow-Token-Minter'}});await response.body?.cancel().catch(()=>undefined);return response.status===204;}catch{return false;}
}

export async function fetchPinnedArchive(deps:Deps,token:string,repository:string,baseSha:string,maxBytes=33554432){
 if(!/^[a-z\d-]+\/[\w.-]+$/i.test(repository)||!/^[a-f\d]{40}$/i.test(baseSha)||!Number.isInteger(maxBytes)||maxBytes<1||maxBytes>33554432)throw new ApiError('validation_failed','Pinned archive identity is invalid.');
 let url=new URL(`/repos/${repository}/tarball/${baseSha}`,API),response:Response|undefined;
 for(let redirects=0;redirects<4;redirects++){
  response=await deps.fetch(url,{redirect:'manual',headers:{accept:'application/vnd.github+json','user-agent':'MergeMate-Workflow-Archive',...(url.origin===API?{authorization:`Bearer ${token}`}: {})}});
  if(response.status<300||response.status>=400)break;
  await response.body?.cancel().catch(()=>undefined);
  const location=response.headers.get('location');if(!location)throw new ApiError('upstream_unavailable','GitHub archive redirect is missing.');
  const next=new URL(location,url),prefix=`/${repository}/`,validApi=next.origin===API&&next.pathname===`/repos/${repository}/tarball/${baseSha}`,validCodeload=next.origin==='https://codeload.github.com'&&[`${prefix}legacy.tar.gz/${baseSha}`,`${prefix}tar.gz/${baseSha}`].some(path=>path.toLowerCase()===next.pathname.toLowerCase());
  if(next.protocol!=='https:'||next.username||next.password||next.port||next.hash||!(validApi||validCodeload))throw new ApiError('forbidden','GitHub archive redirect left the pinned source.');
  url=next;
 }
 if(!response?.ok||!response.body)throw new ApiError('upstream_unavailable','Pinned GitHub archive could not be fetched.');
 return readBoundedBody(response,maxBytes);
}
