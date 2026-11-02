import {useEffect,useState} from 'react';
import type {DependencyContext} from '@mergemate/contracts';
import {api} from '../api';
import {useAuth} from '../context/AuthContext';
import type {PrDetail,PrFile} from '../types';
/** Revision-scoped manifest names only. Missing context never becomes a clean-dependency claim. */
export function useAgentGuardrails(detail:PrDetail|null){
 const {isDemo}=useAuth(),[context,setContext]=useState<{key:string;data:DependencyContext}|null>(null);
 const key=detail?`${detail.owner}/${detail.repo}#${detail.number}:${detail.headSha??'unknown'}`:'';
 useEffect(()=>{setContext(null);if(!detail||isDemo)return;let active=true;const controller=new AbortController();void api.getPrDependencies(detail.owner,detail.repo,detail.number,detail.headSha,controller.signal).then(data=>{if(active&&(!detail.headSha||data.headSha===detail.headSha))setContext({key,data});}).catch(()=>{});return()=>{active=false;controller.abort();};},[key,isDemo]);
 const data=context?.key===key?context.data:undefined;
 return (detail?.files??[]).map((file):PrFile=>{
  if(!data||!data.manifests.some(m=>m.directory==='')||data.unavailable.some(dir=>!dir||file.filename.startsWith(dir+'/')))return file;
  const applicable=data.manifests.filter(m=>!m.directory||file.filename.startsWith(m.directory+'/'));
  return {...file,dependencyNames:[...new Set(applicable.flatMap(m=>m.names))]};
 });
}
