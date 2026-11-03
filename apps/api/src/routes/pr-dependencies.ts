import {Hono} from 'hono';
import type {AppEnv,Deps} from '../env';
import {ApiError} from '../errors';
import {githubGet} from '../lib/github';
import {getAccessToken} from '../lib/github-tokens';
import {readBoundedBody} from '../lib/bounded-body';
const name=(s:string)=>/^[-A-Za-z0-9_.]{1,100}$/.test(s)&&s!=='.'&&s!=='..';
interface Manifest {name?:string;workspaces?:string[]|{packages?:string[]};dependencies?:object;devDependencies?:object;peerDependencies?:object;optionalDependencies?:object}
/** Read dependency names only; never expose manifest values, registry credentials or GitHub tokens. */
export const prDependencies=new Hono<AppEnv>().get('/prs/:owner/:repo/:number/dependencies',async c=>{
 c.header('Cache-Control','private, no-store');const session=c.get('session');if(!session.userId||session.demo)throw new ApiError('forbidden','Dependency context requires a real account.');
 const {owner,repo,number}=c.req.param();if(!name(owner)||!name(repo)||!/^[1-9]\d{0,9}$/.test(number))throw new ApiError('validation_failed','Invalid PR reference.');
 const original=c.get('deps'),signal=AbortSignal.any([c.req.raw.signal,AbortSignal.timeout(20_000)]);
 const deps:Deps={...original,fetch:async(input,init)=>{const res=await original.fetch(input,{...init,signal,redirect:'error'});const body=await readBoundedBody(res,1024*1024);const headers=new Headers(res.headers);headers.delete('content-encoding');headers.delete('content-length');return new Response(body,{status:res.status,headers});}};
 const token=await getAccessToken(c.env,session.userId,original.now()),base=`/repos/${owner}/${repo}`;
 const pull=await githubGet<{head:{sha:string;repo:{full_name:string}|null}}>(deps,token,`${base}/pulls/${number}`);
 if(c.req.query('headSha')&&c.req.query('headSha')!==pull.head.sha)throw new ApiError('pr_changed','Refresh the PR before scanning dependencies.');
 const head=pull.head;if(!head.repo||head.repo.full_name.split('/').length!==2||!head.repo.full_name.split('/').every(name)||!/^[a-f0-9]{40,64}$/i.test(head.sha))throw new ApiError('upstream_unavailable','Dependency revision unavailable.');
 const headRepo=head.repo.full_name;
 const paths:string[]=[];for(let page=1;page<=3;page++){const files=await githubGet<{filename:string}[]>(deps,token,`${base}/pulls/${number}/files?per_page=100&page=${page}`);paths.push(...files.map(f=>f.filename));if(files.length<100)break;}
 const manifests:{directory:string;names:string[]}[]=[],unavailable:string[]=[];
 const load=async(directory:string):Promise<Manifest|null>=>{try{
  const path=(directory?directory+'/':'')+'package.json';const data=await githubGet<{encoding:string;size:number;content:string}>(deps,token,`/repos/${headRepo}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${head.sha}`);
  if(data.encoding!=='base64'||data.size>200_000||typeof data.content!=='string'||data.content.length>300_000)throw new Error('Invalid manifest');
  const raw=Uint8Array.from(atob(data.content.replace(/\s/g,'')),x=>x.charCodeAt(0));if(raw.length>200_000)throw new Error('Manifest too large');const parsed=JSON.parse(new TextDecoder().decode(raw)) as Manifest;
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('Invalid manifest');
  const names=[...new Set([...(typeof parsed.name==='string'?[parsed.name]:[]),...['dependencies','devDependencies','peerDependencies','optionalDependencies'].flatMap(k=>{const value=parsed[k as keyof Manifest];return value&&typeof value==='object'&&!Array.isArray(value)?Object.keys(value):[];})])].filter(n=>/^(@[-\w.]+\/)?[-\w.]+$/.test(n)).slice(0,2000);
  manifests.push({directory,names});return parsed;
 }catch{unavailable.push(directory);return null;}};
 const root=await load(''),patterns=root?(Array.isArray(root.workspaces)?root.workspaces:root.workspaces?.packages??[]):[];
 const dirs=new Set<string>();
 for(const pattern of patterns){if(typeof pattern!=='string'||pattern.startsWith('/')||pattern.includes('..')||pattern.split('/').some(p=>p!=='*'&&!name(p))){unavailable.push('');continue;}const parts=pattern.replace(/\/$/,'').split('/');for(const path of paths){const candidate=path.split('/').slice(0,parts.length);if(candidate.length===parts.length&&parts.every((p,i)=>p==='*'||p===candidate[i])&&candidate.every(name))dirs.add(candidate.join('/'));}}
 if(dirs.size>30)unavailable.unshift('');
 for(const directory of [...dirs].slice(0,30))await load(directory);
 return c.json({headSha:head.sha,manifests,unavailable:[...new Set(unavailable)].slice(0,32)});
});
