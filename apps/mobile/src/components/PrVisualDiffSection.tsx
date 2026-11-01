import React,{useEffect,useRef,useState} from 'react';
import {Image,Pressable,View} from 'react-native';
import {useRouter} from 'expo-router';
import type {PrVisualAsset,UiSegment} from '@mergemate/contracts';
import type {PrDetail} from '../types';
import {api} from '../api';
import {useTheme} from '../context/ThemeContext';
import {useAuth} from '../context/AuthContext';
import {useConsent} from '../context/ConsentContext';
import {useFeatureFlags} from '../hooks/useFeatureFlags';
import {imageAssets,demoVisualAsset,demoUiSegments} from '../workspace/visual';
import {Button} from './Button';
import {Text} from './Text';
import {toUserMessage} from '../api/errors';

export function PrVisualDiffSection({detail,asset,fullScreen=false}:{detail:PrDetail;asset?:string;fullScreen?:boolean}){
 const {colors}=useTheme(),{isDemo}=useAuth(),{aiConsentGranted}=useConsent(),flags=useFeatureFlags(),router=useRouter();
 const files=imageAssets(detail.files),[selected,setSelected]=useState(asset??files[0]?.filename??'');
 const [images,setImages]=useState<Partial<Record<'before'|'after',PrVisualAsset>>>({}),[errors,setErrors]=useState<Partial<Record<'before'|'after',string>>>({});
 const [segments,setSegments]=useState<UiSegment[]>([]),[insight,setInsight]=useState(''),[busy,setBusy]=useState(false),[picked,setPicked]=useState<string|null>(null),[retry,setRetry]=useState(0);
 const generation=useRef(0),request=useRef<AbortController|null>(null),analysisRequest=useRef<AbortController|null>(null);
 useEffect(()=>{if(!files.some(f=>f.filename===selected))setSelected(asset??files[0]?.filename??'');},[detail.headSha,asset,files,selected]);
 useEffect(()=>{
  const version=++generation.current;request.current?.abort();analysisRequest.current?.abort();setImages({});setErrors({});setSegments([]);setInsight('');setPicked(null);setBusy(false);
  if(!selected)return;
  const controller=new AbortController();request.current=controller;
  for(const side of ['before','after'] as const){
   const work=isDemo?Promise.resolve(demoVisualAsset(selected,side)):api.getPrVisualAsset(detail.owner,detail.repo,detail.number,selected,side,detail.headSha,controller.signal);
   void work.then(image=>{if(version===generation.current)setImages(old=>({...old,[side]:image}));}).catch(error=>{if(version===generation.current&&!controller.signal.aborted)setErrors(old=>({...old,[side]:toUserMessage(error,'Preview unavailable. Choose a supported PNG, JPEG or WebP screenshot.')}));});
  }
  return()=>{generation.current++;controller.abort();analysisRequest.current?.abort();};
 },[selected,detail.owner,detail.repo,detail.number,detail.headSha,isDemo,retry]);
 useEffect(()=>{if(!isDemo&&(!flags.highlight||!aiConsentGranted)){analysisRequest.current?.abort();setSegments([]);setInsight('');setBusy(false);}},[flags.highlight,aiConsentGranted,isDemo]);
 const analyze=async()=>{
  if(busy||!images.after)return;
  if(isDemo){setSegments(demoUiSegments);setInsight('Sample result: the after target is 32pt in this schematic fixture, below 44pt. No model was called.');return;}
  if(!flags.highlight||!aiConsentGranted)return;
  const version=generation.current,controller=new AbortController();analysisRequest.current=controller;setBusy(true);
  try{const result=await api.analyzeHighlight(images.after.dataUrl,'Inspect interactive target sizes and clipping. Report normalized UI segments only when reliable.', 'image/png',controller.signal);if(version===generation.current&&!controller.signal.aborted){setSegments(result.segments??[]);setInsight(result.insight);}}
  catch(error){if(version===generation.current&&!controller.signal.aborted)setInsight(toUserMessage(error,'Visual analysis unavailable.'));}
  finally{if(version===generation.current)setBusy(false);}
 };
 if(!files.length)return null;
 return <View testID="pr-visual-diff" style={{padding:16,borderWidth:1,borderColor:colors.border,borderRadius:12,backgroundColor:colors.surface,marginTop:16,gap:12}}>
  <Text accessibilityRole="header" style={{color:colors.text,fontSize:18,fontWeight:'700'}}>Visual UI Audit (Meta SAM-3.1)</Text>
  <Text style={{color:colors.textSecondary}}>{isDemo?'SAMPLE ASSET COMPARISON · schematic fixtures, not fetched PR assets.':'Compare revision-bound assets. AI dimensions are estimates, not measured hit areas.'}</Text>
  <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{files.map(file=><Button key={file.filename} title={file.filename} onPress={()=>setSelected(file.filename)} variant={selected===file.filename?'primary':'secondary'} style={{maxWidth:'100%'}} textStyle={{flexShrink:1}}/>)}</View>
  <View style={{flexDirection:'row',flexWrap:'wrap',gap:12}}>{(['before','after'] as const).map(side=><View key={side} style={{flexGrow:1,flexBasis:240,minWidth:0,gap:8}}>
   <Text style={{color:colors.text,fontWeight:'600'}}>{side==='before'?'Before':'After'}</Text>
   {images[side]?<VisualAsset image={images[side]!} segments={side==='after'?segments:[]} picked={picked} onPick={setPicked}/>:<Text style={{color:colors.textSecondary}}>{errors[side]??'Loading image...'}</Text>}
  </View>)}</View>
  {!!Object.keys(errors).length&&<Button title="Retry previews" variant="secondary" onPress={()=>setRetry(n=>n+1)}/>}
  <Button title={isDemo?'Show Sample UI Inspection':'Analyze UI Targets'} onPress={analyze} loading={busy} disabled={!images.after||(!isDemo&&(!flags.highlight||!aiConsentGranted))}/>
  {!isDemo&&(!flags.highlight||!aiConsentGranted)&&<Text style={{color:colors.textSecondary}}>Live analysis needs Highlight enabled and AI consent. Asset comparison is read-only.</Text>}
  {!!insight&&<Text accessibilityLiveRegion="polite" style={{color:colors.text}}>{insight}</Text>}
  {!!insight&&!segments.length&&<Text style={{color:colors.textSecondary}}>No reliable touch-target metrics were returned. Inspect the image manually.</Text>}
  {segments.map(s=><Pressable key={s.id} accessibilityRole="button" accessibilityLabel={`Inspect ${s.label}`} onPress={()=>setPicked(s.id)} style={{minHeight:44,minWidth:44,padding:12,borderWidth:1,borderColor:s.touchTargetCompliant?colors.border:colors.riskHigh,borderRadius:8}}><Text style={{color:colors.text}}>{s.label}: {s.touchTargetSizePt.width} x {s.touchTargetSizePt.height}pt (estimate){s.touchTargetCompliant?' · Verify actual hit area':' · HIG warning: below 44pt'}</Text>{picked===s.id&&<Text style={{color:colors.textSecondary}}>{s.higViolation??'Verify target dimensions in the rendered interface.'}</Text>}</Pressable>)}
  {!fullScreen&&<Button title="Open Full Screen Inspection" onPress={()=>router.push({pathname:'/highlight',params:{owner:detail.owner,repo:detail.repo,number:String(detail.number),asset:selected,...(detail.headSha?{headSha:detail.headSha}:{})}})}/>}
 </View>;
}
function VisualAsset({image,segments,picked,onPick}:{image:PrVisualAsset;segments:UiSegment[];picked:string|null;onPick:(id:string)=>void}){
 const {colors}=useTheme();const [width,setWidth]=useState(0),height=width*image.height/image.width;
 return <View onLayout={e=>setWidth(e.nativeEvent.layout.width)} style={{width:'100%',aspectRatio:image.width/image.height,overflow:'hidden',backgroundColor:colors.surfaceElevated}}>
  <Image source={{uri:image.dataUrl}} accessibilityLabel={`${image.side} ${image.path}`} style={{width:'100%',height:'100%'}} resizeMode="contain"/>
  {segments.map(s=>{const [y,x,y2,x2]=s.bbox;return <React.Fragment key={s.id}>
   <View pointerEvents="none" style={{position:'absolute',left:x*width,top:y*height,width:(x2-x)*width,height:(y2-y)*height,borderWidth:picked===s.id?3:2,borderColor:s.touchTargetCompliant?colors.brand:colors.riskHigh,backgroundColor:s.touchTargetCompliant?'transparent':'rgba(220,38,38,0.22)'}}/>
   <Pressable accessibilityRole="button" accessibilityLabel={`Inspect image region ${s.label}`} onPress={()=>onPick(s.id)} style={{position:'absolute',left:Math.max(0,Math.min(x*width,width-44)),top:Math.max(0,Math.min(y*height,height-44)),minWidth:44,minHeight:44,width:Math.max(44,(x2-x)*width),height:Math.max(44,(y2-y)*height)}}/>
  </React.Fragment>;})}
 </View>;
}
