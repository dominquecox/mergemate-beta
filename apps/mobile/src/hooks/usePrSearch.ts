import {useCallback,useEffect,useRef,useState} from 'react';
import {PrSearchFilters,type PrSearchPage,type PrSearchItem} from '@mergemate/contracts';
import {api} from '../api';
import {toUserMessage} from '../api/errors';
import {mergeSearchRows} from '../search/rows';
export function usePrSearch(filters:PrSearchFilters){
 const key=JSON.stringify(filters),current=useRef(filters);current.current=filters;
 const generation=useRef(0),controller=useRef<AbortController|null>(null),pending=useRef(false),cursor=useRef<string|null>(null);
 const [state,setState]=useState<{key:string;items:PrSearchItem[];loading:boolean;busy:boolean;error:string|null;meta:Omit<PrSearchPage,'items'>}>({key,items:[],loading:true,busy:true,error:null,meta:{nextCursor:null,candidates:0,incomplete:false,capped:false}});
 const run=useCallback(async(reset:boolean)=>{
  if(!reset&&(pending.current||!cursor.current))return;
  if(reset){generation.current++;controller.current?.abort();cursor.current=null;}
  const parsed=PrSearchFilters.safeParse(current.current),requestKey=JSON.stringify(current.current);if(!parsed.success){setState({key:requestKey,items:[],loading:false,busy:false,error:'Check the filters: use a valid repository, author and UTC date range. Title terms cannot contain query operators.',meta:{nextCursor:null,candidates:0,incomplete:false,capped:false}});pending.current=false;return;}
  const version=generation.current,abort=new AbortController();controller.current=abort;pending.current=true;
  const next=reset?null:cursor.current;
  setState(old=>({...old,key:requestKey,...(reset?{items:[],loading:true,meta:{nextCursor:null,candidates:0,incomplete:false,capped:false}}:{}),busy:true,error:null}));
  try{const page=await api.searchPrs(parsed.data,next,abort.signal);if(version!==generation.current||abort.signal.aborted)return;if(next!==null&&next===page.nextCursor)throw new Error('Search cursor did not advance.');cursor.current=page.nextCursor;setState(old=>({key:requestKey,items:mergeSearchRows(reset?page.items:[...old.items,...page.items]),loading:false,busy:false,error:null,meta:{nextCursor:page.nextCursor,candidates:(reset?0:old.meta.candidates)+page.candidates,incomplete:page.incomplete||(!reset&&old.meta.incomplete),capped:page.capped||(!reset&&old.meta.capped)}}));}
  catch(error){if(version===generation.current&&!abort.signal.aborted)setState(old=>({...old,loading:false,busy:false,error:toUserMessage(error,'Could not search. Try again.')}));}
  finally{if(version===generation.current)pending.current=false;}
 },[]);
 useEffect(()=>{generation.current++;controller.current?.abort();pending.current=false;cursor.current=null;const timer=setTimeout(()=>{void run(true);},300);return()=>{clearTimeout(timer);generation.current++;controller.current?.abort();};},[key,run]);
 const matches=state.key===key;
 return {...state,items:matches?state.items:[],loading:!matches||state.loading,busy:!matches||state.busy,error:matches?state.error:null,hasMore:matches&&!!state.meta.nextCursor,refresh:useCallback(()=>run(true),[run]),more:useCallback(()=>run(false),[run])};
}
