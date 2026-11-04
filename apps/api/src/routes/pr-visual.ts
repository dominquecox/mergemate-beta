import {Hono} from 'hono';
import type {AppEnv,Deps} from '../env';
import {ApiError} from '../errors';
import {githubGet} from '../lib/github';
import {getAccessToken} from '../lib/github-tokens';
import {readBoundedBody} from '../lib/bounded-body';
import {normalizeVisualPreview} from '../images/visual-preview';
import {inspectImage} from '../images/validate';
import {toBase64} from './ai-engine-highlight';

interface Pull {head:{sha:string;repo:{full_name:string}|null};base:{sha:string;repo:{full_name:string}}}
interface File {filename:string;previous_filename?:string;status:string}
const safeName=(s:string)=>/^[-A-Za-z0-9_.]{1,100}$/.test(s)&&s!=='.'&&s!=='..';
/** Private read-only PNG previews. No token, raw_url, or original metadata leaves this route. */
export const prVisual=new Hono<AppEnv>().get('/prs/:owner/:repo/:number/visual',async c=>{
 c.header('Cache-Control','private, no-store');
 const session=c.get('session');if(!session.userId||session.demo)throw new ApiError('forbidden','Use sample assets in demo mode.');
 const {owner,repo,number}=c.req.param(),path=c.req.query('path')??'',side=c.req.query('side');
 if(!safeName(owner)||!safeName(repo)||!/^\d{1,10}$/.test(number)||!path||path.length>500||!['before','after'].includes(side??'')||! /\.(png|jpe?g|webp|svg)$/i.test(path)||path.split('/').some(x=>x==='..'||x==='.'||!x))throw new ApiError('validation_failed','Invalid visual asset.');
 const baseDeps=c.get('deps'),signal=AbortSignal.any([c.req.raw.signal,AbortSignal.timeout(20_000)]);
 const deps:Deps={...baseDeps,fetch:async(input,init)=>{const res=await baseDeps.fetch(input,{...init,signal,redirect:'manual'});if(res.status>=300&&res.status<400){await res.body?.cancel().catch(()=>undefined);throw new ApiError('upstream_unavailable','GitHub redirected this request; redirects are not followed.',{},`github ${res.status}`);}const body=await readBoundedBody(res,4*1024*1024);const headers=new Headers(res.headers);headers.delete('content-encoding');headers.delete('content-length');return new Response(body,{status:res.status,headers});}};
 const token=await getAccessToken(c.env,session.userId,baseDeps.now()),base=`/repos/${owner}/${repo}`;
 const pull=await githubGet<Pull>(deps,token,`${base}/pulls/${number}`);
 if(c.req.query('headSha')&&c.req.query('headSha')!==pull.head.sha)throw new ApiError('pr_changed','Pull request changed. Refresh before inspecting assets.');
 let file:File|undefined;
 for(let page=1;page<=3&&!file;page++){const files=await githubGet<File[]>(deps,token,`${base}/pulls/${number}/files?per_page=100&page=${page}`);file=files.find(f=>f.filename===path);if(files.length<100)break;}
 if(!file)throw new ApiError('not_found','Asset is not in this pull request.');
 if((side==='before'&&file.status==='added')||(side==='after'&&file.status==='removed'))throw new ApiError('not_found','This revision has no asset.');
 const revision=side==='before'?pull.base:pull.head,actualPath=side==='before'?(file.previous_filename??path):path;
 if(!revision.repo||!revision.repo.full_name.split('/').every(safeName)||revision.repo.full_name.split('/').length!==2||! /^[a-f0-9]{40,64}$/i.test(revision.sha))throw new ApiError('upstream_unavailable','Asset revision unavailable.');
 const content=await githubGet<{encoding:string;size:number;content:string}>(deps,token,`/repos/${revision.repo.full_name}/contents/${actualPath.split('/').map(encodeURIComponent).join('/')}?ref=${revision.sha}`);
 if(content.encoding!=='base64'||content.size>2*1024*1024||typeof content.content!=='string'||content.content.length>3_000_000)throw new ApiError('validation_failed','Image exceeds the preview limit.');
 // SVG is conservatively filtered and rasterized; active markup is never returned.
 let bytes:Uint8Array;try{bytes=Uint8Array.from(atob(content.content.replace(/\s/g,'')),x=>x.charCodeAt(0));}catch{throw new ApiError('upstream_unavailable','Image preview unavailable.');}
 if(bytes.length>2*1024*1024)throw new ApiError('payload_too_large','Image exceeds the preview limit.');
 const clean=await normalizeVisualPreview(c.env.IMAGES,bytes,actualPath),shape=inspectImage(clean);
 c.header('Cache-Control','private, no-store');c.header('X-Content-Type-Options','nosniff');
 return c.json({path,side,dataUrl:`data:image/png;base64,${toBase64(clean)}`,width:shape.width,height:shape.height,headSha:pull.head.sha});
});
