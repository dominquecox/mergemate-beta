import React,{useEffect,useState} from 'react';
import {Modal,ScrollView,View} from 'react-native';
import type {ModelTelemetry} from '@mergemate/contracts';
import {useTheme} from '../context/ThemeContext';
import {telemetryLabel,telemetryResponse} from '../workspace/metaTelemetry';
import {Button} from './Button';
import {Icon} from './Icon';
import {Text} from './Text';
/** Correlated, server-observed execution evidence. Samples and unknown precision are never presented as live proof. */
export function MetaTelemetryModal({telemetry,sample=false}:{telemetry?:ModelTelemetry;sample?:boolean}){
 const {colors}=useTheme(),[open,setOpen]=useState(false),available=!!telemetry&&!sample;
 useEffect(()=>{setOpen(false);},[telemetry?.requestId,sample]);
 return <View style={{marginVertical:8}}><Button title={telemetryLabel(telemetry,sample)} icon={<Icon name="pulse-outline" color={colors.brandLight}/>} onPress={()=>setOpen(true)} variant="secondary" textStyle={{flexShrink:1}}/>
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
