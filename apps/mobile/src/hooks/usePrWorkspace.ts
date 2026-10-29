import {useCallback,useEffect,useRef,useState} from 'react';
import {api} from '../api';
import {ApiClientError,toUserMessage} from '../api/errors';
import {applyAiRetry} from '../api/aiRetry';
import type {PrDetail} from '../types';
import {mergeWorkspaceRows} from '../workspace/state';
export type PageSection='files'|'comments'|'checks';
const idle={files:false,comments:false,checks:false},noErrors={files:null,comments:null,checks:null};
export function usePrWorkspace(owner:string,repo:string,number:number,consent:boolean){
 const [detail,setDetail]=useState<PrDetail|null>(null),[isLoading,setLoading]=useState(true),[isRefreshing,setRefreshing]=useState(false),[error,setError]=useState<string|null>(null);
 const [pageBusy,setPageBusy]=useState(idle),[pageError,setPageError]=useState<Record<PageSection,string|null>>(noErrors),[capped,setCapped]=useState(idle),[cursors,setCursors]=useState<Record<PageSection,string|null>>({files:'1',comments:'review:1',checks:'checks:1'});
 const pageControllers=useRef<Partial<Record<PageSection,AbortController>>>({});
 const value=useRef(detail);value.current=detail;const next=useRef(cursors),locks=useRef({...idle}),versions=useRef({files:0,comments:0,checks:0}),active=useRef(true),controllers=useRef(new Set<AbortController>()),metaController=useRef<AbortController|null>(null);
 const control=()=>{const controller=new AbortController();controllers.current.add(controller);return controller;};
 const loadPage=useCallback(async(section:PageSection)=>{
  const current=value.current,cursor=next.current[section];if(!current||!cursor||locks.current[section])return;locks.current[section]=true;setPageBusy(old=>({...old,[section]:true}));setPageError(old=>({...old,[section]:null}));const version=versions.current[section],abort=control();pageControllers.current[section]=abort;
  try{const options={headSha:current.headSha,signal:abort.signal};const page=section==='files'?await api.getPrFilePage(owner,repo,number,cursor,options):section==='comments'?await api.getPrCommentPage(owner,repo,number,cursor,options):await api.getPrCheckPage(owner,repo,number,cursor,options);
   if(!active.current||abort.signal.aborted||versions.current[section]!==version)return;if(page.nextCursor===cursor)throw new Error('Workspace cursor did not advance.');if(page.headSha&&current.headSha&&page.headSha!==current.headSha)throw new ApiClientError('pr_changed','This pull request changed. Refresh the workspace.');
   // Discriminated calls keep each section's row type checked without casts.
   if(section==='files'){const rows=await Promise.resolve(page.items);setDetail(old=>old?{...old,files:mergeWorkspaceRows([...old.files,...rows.filter(isFile)],row=>row.filename)}:old);}
   else if(section==='comments')setDetail(old=>old?{...old,comments:mergeWorkspaceRows([...old.comments,...page.items.filter(isComment)],row=>row.id)}:old);
   else setDetail(old=>old?{...old,checks:mergeWorkspaceRows([...old.checks,...page.items.filter(isCheck)],row=>row.id)}:old);
   next.current={...next.current,[section]:page.nextCursor};setCursors(next.current);if(page.capped)setCapped(old=>({...old,[section]:true}));
  }catch(error){if(active.current&&!abort.signal.aborted&&versions.current[section]===version){setPageError(old=>({...old,[section]:toUserMessage(error,'Could not load this page.')}));if(error instanceof ApiClientError&&['not_found','forbidden','unauthorized'].includes(error.code)){value.current=null;setDetail(null);setError('GitHub access is no longer available for this pull request.');}}}
  finally{controllers.current.delete(abort);if(active.current&&versions.current[section]===version){locks.current[section]=false;setPageBusy(old=>({...old,[section]:false}));}}
 },[owner,repo,number]);
 const loadPr=useCallback(async(resetChecks=true)=>{
  metaController.current?.abort();const abort=control();metaController.current=abort;if(!value.current)setLoading(true);setRefreshing(true);setError(null);
  try{const fresh=await api.getPrMetadata(owner,repo,number,abort.signal,true);if(!active.current||abort.signal.aborted)return;const previous=value.current,changed=previous?.headSha!==fresh.headSha;
   if(changed||!previous){for(const key of ['files','comments','checks'] as const){versions.current[key]++;locks.current[key]=false;pageControllers.current[key]?.abort();}next.current={files:fresh.changedFilesCount===0?null:'1',comments:'review:1',checks:fresh.checkCursor??'checks:1'};setPageBusy({...idle});setPageError({...noErrors});setCapped({...idle});}
   else if(resetChecks){versions.current.checks++;locks.current.checks=false;pageControllers.current.checks?.abort();next.current={...next.current,checks:'checks:1'};setPageError(old=>({...old,checks:null}));setCapped(old=>({...old,checks:false}));}
   const merged=previous&&!changed?{...fresh,files:previous.files,comments:previous.comments,checks:resetChecks?[]:previous.checks,summary:previous.summary,risk:previous.risk,secretWarning:previous.secretWarning,aiNotice:previous.aiNotice}:fresh;value.current=merged;setDetail(merged);setCursors(next.current);
   if(changed||!previous||resetChecks)void loadPage('checks');
  }catch(error){if(active.current&&!abort.signal.aborted){setError(toUserMessage(error,'Could not refresh this pull request.'));if(error instanceof ApiClientError&&['not_found','forbidden','unauthorized'].includes(error.code)){value.current=null;setDetail(null);}}}
  finally{controllers.current.delete(abort);if(active.current&&!abort.signal.aborted){setLoading(false);setRefreshing(false);}}
 },[owner,repo,number,loadPage]);
 useEffect(()=>{active.current=true;void loadPr();return()=>{active.current=false;for(const abort of controllers.current)abort.abort();};},[loadPr]);
 const [aiRetrying,setAiRetrying]=useState(false);const aiLock=useRef(false),aiController=useRef<AbortController|null>(null);
 const retryAi=useCallback(async()=>{
  const current=value.current;if(!consent||!current||aiLock.current)return;aiLock.current=true;setAiRetrying(true);const abort=control(),head=current.headSha;aiController.current=abort;
  try{const [summary,risk]=await Promise.all([current.summary?Promise.resolve(null):Promise.allSettled([api.getPrSummary(owner,repo,number,abort.signal)]).then(([result])=>result),current.risk?Promise.resolve(null):Promise.allSettled([api.getPrRisk(owner,repo,number,abort.signal)]).then(([result])=>result)]);if(active.current&&!abort.signal.aborted&&value.current?.headSha===head)setDetail(old=>old?applyAiRetry(old,summary,risk):old);}
  finally{controllers.current.delete(abort);if(aiController.current===abort){aiLock.current=false;if(active.current)setAiRetrying(false);}}
 },[owner,repo,number,consent]);
 const head=detail?(detail.headSha??'legacy'):null;
 useEffect(()=>{aiController.current?.abort();aiLock.current=false;if(!detail)return;if(consent)void retryAi();else setDetail(old=>old?{...old,summary:undefined,risk:undefined,secretWarning:undefined,aiNotice:undefined}:old);return()=>{aiController.current?.abort();};},[head,consent]);
 const attempts=useRef(0);useEffect(()=>{attempts.current=0;},[head]);useEffect(()=>{if(detail?.mergeState!=='unknown'||attempts.current>=3||isRefreshing)return;const timer=setTimeout(()=>{attempts.current++;void loadPr(false);},4000);return()=>clearTimeout(timer);},[detail?.mergeState,detail?.updatedAt,isRefreshing,loadPr]);
 return {detail,isLoading,isRefreshing,error,loadPr,loadPage,pageBusy,pageError,capped,fileCursor:cursors.files,commentCursor:cursors.comments,checkCursor:cursors.checks,retryAi,aiRetrying};
}
type Row=import('../types').PrFile|import('../types').PrComment|import('../types').PrCheck;
function isFile(row:Row):row is import('../types').PrFile{return 'filename'in row;}
function isComment(row:Row):row is import('../types').PrComment{return 'body'in row;}
function isCheck(row:Row):row is import('../types').PrCheck{return 'conclusion'in row;}
