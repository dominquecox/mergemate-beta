import {api} from "../api";
import React,{useEffect,useState} from 'react';
import {Modal,Share,View,TouchableOpacity} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import type {PrDetail} from '../types';
import {useTheme} from '../context/ThemeContext';
import {getExecutiveVerdict} from '../workspace/executiveVerdict';
import {detectBlastRadius} from '../workspace/blastRadius';
import {triggerAndroidHaptic} from '../platform/android';
import {Button} from './Button';
import {CopyDetailsButton} from './CopyDetailsButton';
import {errorDetailsOf,type ErrorDetails} from '../api/error-details';
import {Text} from './Text';
import {Icon} from './Icon';

export function verdictMessage(detail:PrDetail){
 const verdict=getExecutiveVerdict(detail);
 return `${detail.owner}/${detail.repo}#${detail.number}: ${detail.title}\n${verdict.headline}\n${verdict.reasons.join('\n')}\nBlast radius: ${detectBlastRadius(detail.files).map(x=>x.label).join(', ')||'Unassessed'}\n${detail.htmlUrl}\nHuman review required; MergeMate has not approved or merged this PR.`;
}
type Working = null | 'queue' | 'undo' | 'ship' | 'senior' | 'share';
type Notice = { text: string; error?: ErrorDetails & { message: string } };

export function ExecutiveActionBar({detail,onOpenGitHub,onAddNote}:{detail:PrDetail;onOpenGitHub:()=>void;onAddNote:()=>void}){
 const {colors}=useTheme(),insets=useSafeAreaInsets(),verdict=getExecutiveVerdict(detail);
 const [confirm,setConfirm]=useState(false),[notice,setNotice]=useState<Notice|null>(null),[working,setWorking]=useState<Working>(null),[queued,setQueued]=useState<boolean|null>(null);
 const prRef=`${detail.owner}/${detail.repo}#${detail.number}`;
 useEffect(()=>{setConfirm(false);setNotice(null);},[detail.headSha,verdict.level,detail.status]);
 // Whether this PR is already in Needs you. Unknown (null) leaves the button usable; saving again is harmless.
 useEffect(()=>{let live=true;setQueued(null);api.getTriageChoice(prRef).then(lane=>{if(live)setQueued(lane==='needs_you');},()=>{if(live)setQueued(null);});return()=>{live=false;};},[prRef]);
 const low=verdict.level==='safe',blocked=verdict.level==='blocked',tone=low?colors.riskLow:blocked?colors.riskHigh:colors.riskMedium;
 const busy=working!==null;
 const fail=(text:string,cause:unknown)=>setNotice({text,error:{...(errorDetailsOf(cause)??{}),message:text}});
 // Runs one action with the buttons locked and says what it is doing; always unlocks.
 const run=async(kind:Exclude<Working,null>,work:()=>Promise<void>)=>{if(working)return;setWorking(kind);setNotice(null);try{await work();}finally{setWorking(null);}};
 const copy=async()=>{if(!await Clipboard.setStringAsync(verdictMessage(detail)))throw new Error("Clipboard unavailable");triggerAndroidHaptic();};
 const queue=()=>run('queue',async()=>{
  try{await api.setTriageChoice(prRef,'needs_you');triggerAndroidHaptic();setQueued(true);setNotice({text:'Added to Needs you. GitHub is unchanged.'});}
  catch(cause){fail('Could not add this to Needs you. Check your connection and press Review later again, or use Share Verdict.',cause);}
 });
 const undo=()=>run('undo',async()=>{
  try{await api.undoTriageChoice(prRef);setQueued(false);setNotice({text:'Removed from Needs you.'});}
  catch(cause){fail('Could not remove this from Needs you. Press Undo again in a moment.',cause);}
 });
 const senior=()=>run('senior',async()=>{
  try{await copy();setNotice({text:'Risk breakdown copied. Share it with a senior reviewer.'});}
  catch(cause){fail('Could not copy the risk breakdown. Use Share Verdict instead.',cause);}
 });
 const ship=()=>run('ship',async()=>{setConfirm(true);});
 const primary=()=>void(low?ship():blocked?senior():queue());
 const share=()=>run('share',async()=>{try{await Share.share({message:verdictMessage(detail)});}catch(cause){try{await copy();setNotice({text:'Sharing is not available here, so the verdict was copied instead.'});}catch{fail('Could not share or copy the verdict. Open the PR in GitHub instead.',cause);}}});
 const inNeedsYou=!low&&!blocked&&queued===true;
 const label=low?(working==='ship'?'Opening…':'Approve & Ship'):blocked?(working==='senior'?'Copying…':'Senior Review'):(working==='queue'?'Queuing…':'Review later');
 const a11y=low?'Approve & Ship':blocked?'Request Senior Review':'Review later';
 return <View testID="executive-action-bar" style={{backgroundColor:colors.surface,borderTopWidth:1,borderTopColor:colors.border,padding:12,paddingBottom:12+insets.bottom,gap:8}}>
  {!!notice&&<View accessibilityRole={notice.error?'alert':undefined} accessibilityLiveRegion="polite" style={{gap:6,padding:10,borderRadius:10,borderWidth:1,borderColor:notice.error?colors.riskHigh:colors.brandMuted,backgroundColor:notice.error?colors.riskHighBg:colors.brandSubtle}}>
   <Text style={{color:notice.error?colors.riskHigh:colors.text,fontWeight:'600'}}>{notice.text}</Text>
   {notice.error&&<CopyDetailsButton report={{...notice.error,at:notice.error.at??new Date(),step:'PR action bar'}}/>}
  </View>}
  <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
   {inNeedsYou?<View style={{flex:1,flexDirection:'row',alignItems:'center',gap:8}}>
    <View accessibilityRole="text" accessibilityLabel="In Needs you" style={{flex:1,minHeight:44,borderRadius:24,borderWidth:1,borderColor:colors.border,backgroundColor:colors.surfaceElevated,paddingHorizontal:12,paddingVertical:10,alignItems:'center',justifyContent:'center'}}><Text style={{fontWeight:'700',fontSize:14,color:colors.textSecondary}}>{working==='undo'?'Removing…':'✓ In Needs you'}</Text></View>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Undo, remove from Needs you" accessibilityState={{disabled:busy,busy:working==='undo'}} disabled={busy} onPress={()=>void undo()} style={{minHeight:44,minWidth:44,paddingHorizontal:8,alignItems:'center',justifyContent:'center'}}><Text style={{fontSize:12,fontWeight:'600',color:colors.brandLight}}>Undo</Text></TouchableOpacity>
   </View>:<TouchableOpacity accessibilityRole="button" accessibilityLabel={a11y} accessibilityState={{disabled:busy,busy}} disabled={busy} onPress={primary} style={{flex:1,minWidth:44,minHeight:44,borderRadius:24,backgroundColor:tone,opacity:busy?0.7:1,paddingHorizontal:12,paddingVertical:10,alignItems:'center',justifyContent:'center'}}>
    <Text numberOfLines={2} style={{fontWeight:'700',fontSize:14,lineHeight:18,color:colors.background,textAlign:'center'}}>{label}</Text>
    {!low&&!blocked&&<Text numberOfLines={2} style={{fontSize:11,lineHeight:14,color:colors.background,textAlign:'center'}}>Adds it to Needs you. GitHub is unchanged.</Text>}
   </TouchableOpacity>}
   {([{name:'share-outline',label:'Share Verdict',action:share},{name:'create-outline',label:'Add Note',action:onAddNote},{name:'logo-github',label:'Open in GitHub',action:onOpenGitHub}] as const).map(item=><TouchableOpacity key={item.name} accessibilityRole="button" accessibilityLabel={item.label} accessibilityState={{disabled:busy&&item.name==='share-outline'}} disabled={busy&&item.name==='share-outline'} onPress={()=>void item.action()} style={{width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center',backgroundColor:colors.surfaceElevated}}><Icon name={item.name} size={20} color={colors.textSecondary}/></TouchableOpacity>)}
  </View>
  <Modal visible={confirm} transparent animationType="slide" onRequestClose={()=>setConfirm(false)}>
   <View style={{flex:1,justifyContent:'flex-end',backgroundColor:'rgba(0,0,0,0.6)'}}>
    <View accessibilityViewIsModal style={{backgroundColor:colors.surface,padding:24,paddingBottom:24+insets.bottom,gap:16}}>
     <Text accessibilityRole="header" style={{color:colors.text,fontSize:20,fontWeight:'700'}}>Confirm GitHub handoff</Text>
     <Text style={{color:colors.text}}>Low risk is a review signal, not a safety guarantee. Verify the exact commit, tests and branch rules in GitHub. If you choose auto-merge there, GitHub must enforce required checks. MergeMate has read-only access and will not approve, merge or enable auto-merge.</Text>
     <Button title="Continue in GitHub" onPress={()=>{setConfirm(false);onOpenGitHub();setNotice({text:'Opened in GitHub. MergeMate has not approved or merged anything.'});}}/>
     <Button title="Cancel" variant="secondary" onPress={()=>setConfirm(false)}/>
    </View>
   </View>
  </Modal>
 </View>;
}
