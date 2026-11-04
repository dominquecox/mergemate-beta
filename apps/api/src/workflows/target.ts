import type { WorkflowTarget } from '@mergemate/contracts';
import type { Env,Deps } from '../env';
import type { SessionRecord } from '../lib/sessions';
import { getAccessToken } from '../lib/github-tokens';
import { githubGet } from '../lib/github';
import { githubPrDataSource,type PrData } from '../routes/ai-engine-pr-data';
import { ApiError } from '../errors';
export interface TargetSnapshot {headSha:string;baseBranch:string;data:PrData;canWrite:boolean;kind:'pull_request'|'issue'|'repository';repositoryId:number;repository:string;fromFork:boolean}
export async function targetSnapshot(env:Env,deps:Deps,session:SessionRecord,target:WorkflowTarget,requireWrite=false):Promise<TargetSnapshot>{
 if(!session.userId||session.demo)throw new ApiError('forbidden','Agent runs require a signed-in GitHub account.');
 const token=await getAccessToken(env,session.userId,deps.now()),repoPath=`/repos/${target.owner}/${target.repo}`;
 const requestedRepository=`${target.owner}/${target.repo}`.toLowerCase();
 const repo=await githubGet<{id:number;full_name:string;default_branch:string;permissions?:{push?:boolean;maintain?:boolean;admin?:boolean}}>(deps,token,repoPath);
 if(!Number.isSafeInteger(repo.id)||repo.id<1||repo.full_name?.toLowerCase()!==requestedRepository)throw new ApiError('forbidden','GitHub did not confirm access to the exact repository identity.');
 const canWrite=!!(repo.permissions?.push||repo.permissions?.maintain||repo.permissions?.admin);
 if(requireWrite&&!canWrite)throw new ApiError('forbidden','You need write access to this repository before an agent can prepare a draft PR.');
 const kind=target.kind??'pull_request';
 if(kind==='pull_request'){
  if(!target.number)throw new ApiError('validation_failed','A pull request number is required.');
  const detail=await githubGet<{state:string;head:{ref:string;repo:{id:number;full_name:string}|null}}>(deps,token,`${repoPath}/pulls/${target.number}`);
  const fromFork=!detail.head.repo||detail.head.repo.id!==repo.id||detail.head.repo.full_name.toLowerCase()!==requestedRepository;
  if(requireWrite&&(detail.state!=='open'||fromFork))throw new ApiError('forbidden','Code-fix agents require an open same-repository pull request. Fork pull requests are analysis-only.');
  const data=await githubPrDataSource(env,deps)(session,{owner:target.owner,repo:target.repo,number:target.number});
  if(!data)throw new ApiError('upstream_unavailable','The PR snapshot is unavailable.');
  return {headSha:data.headSha,baseBranch:detail.head.ref,data,canWrite,kind,repositoryId:repo.id,repository:repo.full_name.toLowerCase(),fromFork};
 }
 const baseBranch=target.baseBranch??repo.default_branch;
 if(!baseBranch||!/^[-a-zA-Z0-9_./]{1,160}$/.test(baseBranch)||baseBranch.includes('..'))throw new ApiError('validation_failed','Choose a valid base branch.');
 const commit=await githubGet<{sha:string}>(deps,token,`${repoPath}/commits/${encodeURIComponent(baseBranch)}`);
 let title=`Repository task: ${target.owner}/${target.repo}`,description='Repository task. No pull request diff exists; analysis is metadata-only until isolated source inspection.';
 if(kind==='issue'){
  if(!target.number)throw new ApiError('validation_failed','An issue number is required.');
  const issue=await githubGet<{title:string;body:string|null;pull_request?:unknown}>(deps,token,`${repoPath}/issues/${target.number}`);
  if(issue.pull_request)throw new ApiError('validation_failed','This number is a pull request; use a pull-request target.');
  title=issue.title.slice(0,300);description=(issue.body??'').slice(0,8000);
 }
 return {headSha:commit.sha,baseBranch,canWrite,kind,repositoryId:repo.id,repository:repo.full_name.toLowerCase(),fromFork:false,data:{title,description,headSha:commit.sha,files:[],authorIsBot:false,coAuthoredByBot:false,hasTests:null,checksFailing:null}};
}
