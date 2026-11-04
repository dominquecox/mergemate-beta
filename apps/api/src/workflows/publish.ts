import { z } from 'zod';
import type { Deps } from '../env';
import { ApiError } from '../errors';
import { readBoundedBody } from '../lib/bounded-body';

const API='https://api.github.com';
const Sha=z.string().regex(/^[a-f\d]{40}$/i);
const Commit=z.object({sha:Sha,tree:z.object({sha:Sha}),parents:z.array(z.object({sha:Sha})),message:z.string()}).passthrough();
const Ref=z.object({object:z.object({sha:Sha})}).passthrough();
const Pull=z.object({html_url:z.string().url(),draft:z.boolean(),state:z.string(),head:z.object({sha:Sha,repo:z.object({full_name:z.string()})}),base:z.object({repo:z.object({full_name:z.string()})})}).passthrough();
type Change={path:string;content:string};
type Job={id:string;runId:string;repository:string;repositoryId:number;baseSha:string;baseBranch:string;intent:string};

async function request<T>(deps:Deps,token:string,repository:string,path:string,schema:z.ZodType<T>,init?:{method:'POST';body:unknown},allowMissing=false):Promise<T|null>{
 const url=new URL(`/repos/${repository}${path}`,API);if(url.origin!==API)throw new ApiError('misconfigured','GitHub publication route is invalid.');
 const response=await deps.fetch(url,{method:init?.method??'GET',redirect:'error',headers:{accept:'application/vnd.github+json',authorization:`Bearer ${token}`,'x-github-api-version':'2022-11-28','user-agent':'MergeMate-Workflow-Publisher',...(init?{'content-type':'application/json'}:{})},...(init?{body:JSON.stringify(init.body)}:{})});
 if(allowMissing&&response.status===404){await response.body?.cancel().catch(()=>undefined);return null;}
 if(!response.ok)throw new ApiError(response.status===404||response.status===403?'forbidden':'upstream_unavailable','GitHub draft publication failed.');
 const raw=await readBoundedBody(response,262144);let value:unknown;try{value=JSON.parse(new TextDecoder().decode(raw));}catch{throw new ApiError('upstream_unavailable','GitHub returned invalid publication evidence.');}
 const parsed=schema.safeParse(value);if(!parsed.success)throw new ApiError('upstream_unavailable','GitHub returned invalid publication evidence.');return parsed.data;
}

export async function publishApprovedPatch(deps:Deps,token:string,job:Job,changes:Change[]){
 if(!changes.length||changes.length>8||changes.some(change=>!change.path||typeof change.content!=='string'))throw new ApiError('validation_failed','Approved patch is invalid.');
 const branch=`mergemate-agent/${job.runId}`,message=`fix: agent task ${job.runId}`;
 const base=await request(deps,token,job.repository,`/git/commits/${job.baseSha}`,Commit);if(!base||base.sha!==job.baseSha)throw new ApiError('pr_changed','The pinned base commit changed.');
 const entries=[];for(const change of changes){const blob=await request(deps,token,job.repository,'/git/blobs',z.object({sha:Sha}).passthrough(),{method:'POST',body:{content:change.content,encoding:'utf-8'}});if(!blob)throw new ApiError('upstream_unavailable','GitHub did not create an approved blob.');entries.push({path:change.path,mode:'100644',type:'blob',sha:blob.sha});}
 const tree=await request(deps,token,job.repository,'/git/trees',z.object({sha:Sha}).passthrough(),{method:'POST',body:{base_tree:base.tree.sha,tree:entries}});if(!tree)throw new ApiError('upstream_unavailable','GitHub did not create the approved tree.');
 const refPath=`/git/ref/heads/${encodeURIComponent(branch)}`;let ref=await request(deps,token,job.repository,refPath,Ref,undefined,true),commit:z.infer<typeof Commit>;
 if(ref){const existing=await request(deps,token,job.repository,`/git/commits/${ref.object.sha}`,Commit);if(!existing||existing.tree.sha!==tree.sha||existing.parents.length!==1||existing.parents[0]?.sha!==job.baseSha||existing.message!==message)throw new ApiError('state_conflict','The agent branch does not match the approved patch.');commit=existing;}
 else{const created=await request(deps,token,job.repository,'/git/commits',Commit,{method:'POST',body:{message,tree:tree.sha,parents:[job.baseSha]}});if(!created)throw new ApiError('upstream_unavailable','GitHub did not create the approved commit.');await request(deps,token,job.repository,'/git/refs',Ref,{method:'POST',body:{ref:`refs/heads/${branch}`,sha:created.sha}});commit=created;ref={object:{sha:created.sha}};}
 const owner=job.repository.split('/')[0]??'',list=await request(deps,token,job.repository,`/pulls?state=all&head=${encodeURIComponent(`${owner}:${branch}`)}&per_page=10`,z.array(Pull).max(2));if(!list||list.length>1)throw new ApiError('state_conflict','Draft publication is ambiguous.');
 const pull=list[0]??await request(deps,token,job.repository,'/pulls',Pull,{method:'POST',body:{title:`Agent fix: ${job.intent.slice(0,100).replace(/[\r\n]/g,' ')}`,head:branch,base:job.baseBranch,draft:true,body:`Automated code-fix workflow ${job.runId}.\n\nPinned source: ${job.baseSha}\n\nThe API published only the exact passkey-approved patch after isolated tests passed. Human review is required.`}});if(!pull)throw new ApiError('upstream_unavailable','GitHub did not create the draft pull request.');
 if(!pull.draft||pull.state!=='open'||pull.head.sha!==commit.sha||pull.head.repo.full_name.toLowerCase()!==job.repository||pull.base.repo.full_name.toLowerCase()!==job.repository)throw new ApiError('validation_failed','GitHub did not confirm the exact approved draft pull request.');
 return {commitSha:commit.sha,draftPrUrl:pull.html_url,treeSha:tree.sha,branch};
}
