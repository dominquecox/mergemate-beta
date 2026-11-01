import React,{useEffect,useState} from 'react';
import {ScrollView,View} from 'react-native';
import {api} from '../api';
import type {PrDetail} from '../types';
import {Header} from './Header';
import {PrVisualDiffSection} from './PrVisualDiffSection';
import {ErrorState} from './ErrorState';
import {LoadingState} from './LoadingState';
export function PrAssetInspection({owner,repo,number,asset,headSha}:{owner:string;repo:string;number:string;asset:string;headSha?:string}){
 const [detail,setDetail]=useState<PrDetail|null>(null),[error,setError]=useState(false),[retry,setRetry]=useState(0);
 useEffect(()=>{let active=true;const controller=new AbortController();setDetail(null);setError(false);void (async()=>{const d=await api.getPrMetadata(owner,repo,Number(number),controller.signal,true);let cursor:string|null|undefined;
 for(let page=0;page<12&&!d.files.some(f=>f.filename===asset);page++){const result=await api.getPrFilePage(owner,repo,Number(number),cursor,{signal:controller.signal,...(d.headSha?{headSha:d.headSha}:{})});d.files.push(...result.items);cursor=result.nextCursor;if(!cursor)break;}
 return d;})().then(d=>{if(active){if(headSha&&d.headSha&&headSha!==d.headSha)setError(true);else if(!d.files.some(f=>f.filename===asset))setError(true);else setDetail(d);}}).catch(()=>{if(active)setError(true);});return()=>{active=false;controller.abort();};},[owner,repo,number,asset,headSha,retry]);
 return <View style={{flex:1}}><Header title="Full Screen Inspection" showBack/><ScrollView contentContainerStyle={{padding:16}}>{error?<ErrorState title="Asset context unavailable" message="The PR changed or this asset is unavailable. Refresh the workspace and select it again." onRetry={()=>setRetry(n=>n+1)}/>:detail?<PrVisualDiffSection detail={detail} asset={asset} fullScreen/>:<LoadingState title="Loading asset context..." message="Verifying the pull request and revision."/>}</ScrollView></View>;
}
