import {api} from "../api";
import React,{useEffect,useState} from 'react';
import {Modal,Share,View} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import type {PrDetail} from '../types';
import {useTheme} from '../context/ThemeContext';
import {getExecutiveVerdict} from '../workspace/executiveVerdict';
import {detectBlastRadius} from '../workspace/blastRadius';
import {triggerAndroidHaptic} from '../platform/android';
import {Button} from './Button';
import {Text} from './Text';

export function verdictMessage(detail:PrDetail){
 const verdict=getExecutiveVerdict(detail);
 return `${detail.owner}/${detail.repo}#${detail.number}: ${detail.title}\n${verdict.headline}\n${verdict.reasons.join('\n')}\nBlast radius: ${detectBlastRadius(detail.files).map(x=>x.label).join(', ')||'Unassessed'}\n${detail.htmlUrl}\nHuman review required; MergeMate has not approved or merged this PR.`;
}
export function ExecutiveActionBar({detail,onOpenGitHub,onAddNote}:{detail:PrDetail;onOpenGitHub:()=>void;onAddNote:()=>void}){
 const {colors}=useTheme(),insets=useSafeAreaInsets(),verdict=getExecutiveVerdict(detail);
 const [confirm,setConfirm]=useState(false),[notice,setNotice]=useState('');
 useEffect(()=>{setConfirm(false);setNotice('');},[detail.headSha,verdict.level,detail.status]);
 const low=verdict.level==='safe',blocked=verdict.level==='blocked',tone=low?colors.riskLow:blocked?colors.riskHigh:colors.riskMedium;
 const copy=async()=>{try{if(!await Clipboard.setStringAsync(verdictMessage(detail)))throw new Error("Clipboard unavailable");triggerAndroidHaptic();setNotice(blocked?'Risk breakdown copied. Share it with a senior reviewer.':'Desktop review brief copied.');}catch{setNotice('Clipboard unavailable. Use Share Verdict instead.');}};
 const primary=async()=>{if(low){setConfirm(true);return;}if(blocked){await copy();return;}
  try{await api.setTriageChoice(`${detail.owner}/${detail.repo}#${detail.number}`,'needs_you');triggerAndroidHaptic();setNotice('Queued for desktop review in Needs you. GitHub is unchanged.');}catch{setNotice('Could not queue this review. Try again or Share Verdict.');}
 };
 const share=async()=>{try{await Share.share({message:verdictMessage(detail)});}catch{await copy();}};
 return <View testID="executive-action-bar" style={{backgroundColor:colors.surface,borderTopWidth:1,borderTopColor:colors.border,padding:12,paddingBottom:12+insets.bottom,gap:8}}>
  {!!notice&&<Text accessibilityLiveRegion="polite" style={{color:colors.textSecondary}}>{notice}</Text>}
  <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
   <Button title={low?'Approve & Ship':blocked?'Request Senior Review':'Queue for Desktop'} onPress={primary} style={{flexGrow:1,minWidth:160,backgroundColor:tone}} textStyle={{color:colors.background}}/>
   <Button title="Share Verdict" onPress={share} variant="secondary"/>
   <Button title="Add Note" onPress={onAddNote} variant="ghost"/>
   {!low&&<Button title="Open in GitHub" onPress={onOpenGitHub} variant="ghost"/>}
  </View>
  <Modal visible={confirm} transparent animationType="slide" onRequestClose={()=>setConfirm(false)}>
   <View style={{flex:1,justifyContent:'flex-end',backgroundColor:'rgba(0,0,0,0.6)'}}>
    <View accessibilityViewIsModal style={{backgroundColor:colors.surface,padding:24,paddingBottom:24+insets.bottom,gap:16}}>
     <Text accessibilityRole="header" style={{color:colors.text,fontSize:20,fontWeight:'700'}}>Confirm GitHub handoff</Text>
     <Text style={{color:colors.text}}>Low risk is a review signal, not a safety guarantee. Verify the exact commit, tests and branch rules in GitHub. If you choose auto-merge there, GitHub must enforce required checks. MergeMate has read-only access and will not approve, merge or enable auto-merge.</Text>
     <Button title="Continue in GitHub" onPress={()=>{setConfirm(false);onOpenGitHub();}}/>
     <Button title="Cancel" variant="secondary" onPress={()=>setConfirm(false)}/>
    </View>
   </View>
  </Modal>
 </View>;
}
