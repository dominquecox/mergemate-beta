import React,{useEffect,useState} from 'react';
import {Modal,ScrollView,View,TouchableOpacity} from 'react-native';
import type {ModelTelemetry} from '@mergemate/contracts';
import {useTheme} from '../context/ThemeContext';
import {telemetryLabel,telemetryResponse} from '../workspace/metaTelemetry';
import {Button} from './Button';
import {Icon} from './Icon';
import {Text} from './Text';
/** Correlated, server-observed execution evidence. Samples and unknown precision are never presented as live proof. */
export function MetaTelemetryModal({telemetry,sample=false,compact=false}:{telemetry?:ModelTelemetry;sample?:boolean;compact?:boolean}){
 const {colors}=useTheme(),[open,setOpen]=useState(false),available=!!telemetry&&!sample;
 useEffect(()=>{setOpen(false);},[telemetry?.requestId,sample]);
 if(!available)return null;
 const model=telemetry.modelId.includes('llama-3.2')?'Meta Llama 3.2 Vision':telemetry.modelId.includes('llama-3.3')?'Meta Llama 3.3':telemetry.modelId.split('/').at(-1)??'Meta model';
 return <View style={{marginTop:compact?6:0,alignSelf:'flex-start',maxWidth:'100%'}}><TouchableOpacity accessibilityRole="button" accessibilityLabel={telemetryLabel(telemetry,sample)} onPress={()=>setOpen(true)} style={{minHeight:44,minWidth:44,maxWidth:'100%',flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:compact?9:10,borderRadius:22,backgroundColor:colors.surfaceElevated}}><Icon name="flash-outline" size={14} color={colors.brandLight}/><Text numberOfLines={1} style={{color:colors.textSecondary,flexShrink:1,fontSize:compact?11:12}}>{model} ({telemetry.latencyMs}ms)</Text></TouchableOpacity>
  <Modal visible={open} transparent animationType="fade" onRequestClose={()=>setOpen(false)}>
   <View style={{flex:1,justifyContent:'center',padding:20,backgroundColor:'rgba(0,0,0,0.65)'}}>
    <View accessibilityViewIsModal style={{maxHeight:'90%',padding:20,borderRadius:20,backgroundColor:colors.surface,gap:12}}>
     <Text accessibilityRole="header" style={{fontSize:20,fontWeight:'700',color:colors.text}}>Meta Execution Inspector</Text>
     <ScrollView><Text selectable style={{color:colors.text}}>{available?[
      `Model ID: ${telemetry.modelId}`,`Execution environment: ${telemetry.environment}`,
      `Latency: ${telemetry.latencyMs} ms`,`Prompt tokens: ${telemetry.promptTokens??'Not reported'}`,`Completion tokens: ${telemetry.completionTokens??'Not reported'}`,
      `Precision: ${telemetry.precision??'Not reported (not inferred)'}`,`Request ID: ${telemetry.requestId}`,`Observed at: ${telemetry.observedAt}`,
      'Recorded execution, possibly cached. Correlate request ID with server evidence; this is not independent hardware attestation.',
     ].join('\n'):sample?'Sample mode: no live model executed. No latency, tokens or precision are fabricated.':'No request-scoped execution evidence is available yet. Run an authorized analysis to inspect its actual result.'}</Text>
     <Text style={{color:colors.textSecondary,marginTop:16}}>Validated model response geometry / task telemetry. Prompts, images, credentials and unrestricted raw output are omitted.</Text>
     <Text selectable style={{color:colors.text,fontFamily:'monospace',marginTop:8}}>{telemetryResponse(telemetry,sample)}</Text></ScrollView>
     <Button title="Close Telemetry" onPress={()=>setOpen(false)}/>
    </View>
   </View>
  </Modal>
 </View>;
}
