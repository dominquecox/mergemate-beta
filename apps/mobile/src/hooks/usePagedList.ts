import {watchConnectivity} from '../platform/connectivity';
import {AppState} from 'react-native';
import {useCallback,useEffect,useRef,useState} from 'react';
import {toUserMessage} from '../api/errors';
type Page<T>={items:T[];nextCursor:string|null;serverTime?:string;refreshAt?:string|null};
/** Keep a newer revision when two live upstream pages overlap. Other lists retain last-value wins. */
export function mergePageItems<T extends {id:string}>(items:T[]):T[]{
 const rows=new Map<string,T>();
 for(const item of items){const old=rows.get(item.id);if(old&&'updatedAt'in old&&'updatedAt'in item&&typeof old.updatedAt==='string'&&typeof item.updatedAt==='string'&&Date.parse(old.updatedAt)>Date.parse(item.updatedAt))continue;rows.set(item.id,item);}return [...rows.values()];
}
/** One append in flight; reset supersedes it. Revalidation preserves loaded pages for Back. */
export function usePagedList<T extends {id:string}>(key:string,load:(cursor?:string|null)=>Promise<Page<T>>,invalidate?:()=>void){
 const invalidator=useRef(invalidate);invalidator.current=invalidate;
 const loader=useRef(load);loader.current=load;
 const generation=useRef(0),pending=useRef(false),cursor=useRef<string|null>(null),pages=useRef(0);
 const [items,setItems]=useState<T[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[hasMore,setHasMore]=useState(false),[refreshAfterMs,setRefreshAfterMs]=useState<number|null>(null);
 const fetchPage=useCallback(async(reset:boolean,preserve=false)=>{
  if(!reset&&(pending.current||!cursor.current))return;
  if(reset&&pending.current)generation.current++;
  pending.current=true;setBusy(true);setError(null);const version=generation.current;
  const count=reset&&preserve?Math.max(1,pages.current):1;
  let next=reset?null:cursor.current;let gathered:T[]=[];let first:Page<T>|undefined;let fetched=0;
  try{
   for(let i=0;i<count;i++){
    const page=await loader.current(next);if(version!==generation.current)return;
    if(next!==null&&page.nextCursor===next)throw new Error('Pagination did not advance.');
    first??=page;gathered=mergePageItems([...gathered,...page.items]);next=page.nextCursor;fetched++;
    if(!next)break;
   }
   cursor.current=next;pages.current=reset?fetched:pages.current+1;setHasMore(!!next);
   if(first?.refreshAt&&first.serverTime)setRefreshAfterMs(Math.max(0,Date.parse(first.refreshAt)-Date.parse(first.serverTime)));else setRefreshAfterMs(null);
   setItems(old=>mergePageItems(reset?gathered:[...old,...gathered]));
  }catch(error){if(version===generation.current)setError(toUserMessage(error,'Could not load this page. Try again.'));}
  finally{if(version===generation.current){pending.current=false;setBusy(false);setLoading(false);}}
 },[]);
 useEffect(()=>{generation.current++;pending.current=false;cursor.current=null;pages.current=0;setItems([]);setLoading(true);setHasMore(false);void fetchPage(true);return()=>{generation.current++;};},[key,fetchPage]);
 useEffect(()=>{
  const reconnect=()=>{invalidator.current?.();if(!pending.current)void fetchPage(true,true);};
  let previous:boolean|null=null;
  const unwatch=watchConnectivity(state=>{if(previous===false&&state.online===true)reconnect();previous=state.online;});
  const subscription=AppState.addEventListener('change',state=>{if(state==='active')reconnect();});
  return()=>{unwatch();subscription.remove();};
 },[fetchPage]);
 return {items,setItems,loading,busy,error,setError,hasMore,refreshAfterMs,refresh:useCallback(()=>fetchPage(true),[fetchPage]),revalidate:useCallback(()=>fetchPage(true,true),[fetchPage]),more:useCallback(()=>fetchPage(false),[fetchPage])};
}
