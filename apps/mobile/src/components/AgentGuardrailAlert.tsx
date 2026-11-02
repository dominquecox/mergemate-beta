import React from 'react';
import {View} from 'react-native';
import type {PrFile} from '../types';
import {scanAgentGuardrails,guardrailCoverage} from '../workspace/agentGuardrails';
import {useTheme} from '../context/ThemeContext';
import {Text} from './Text';
import {Icon} from './Icon';
export function AgentGuardrailAlert({files,agentAuthored,total}:{files:readonly PrFile[];agentAuthored:boolean;total?:number}){
 const {colors}=useTheme(),findings=scanAgentGuardrails(files),coverage=guardrailCoverage(files,total);
 if(!findings.length&&!agentAuthored)return null;
 const tone=findings.some(f=>f.severity==='high')?colors.riskHigh:findings.length?colors.riskMedium:colors.textSecondary;
 return <View testID="agent-guardrails" style={{borderWidth:1,borderColor:tone,borderRadius:10,padding:12,gap:8,marginTop:12}}>
  <View style={{flexDirection:'row',gap:8,alignItems:'center'}}><Icon name="shield-checkmark-outline" color={tone}/><Text accessibilityRole="header" style={{color:tone,fontWeight:'700'}}>{findings.length?'Agent Guardrails Alert':'Agent Guardrails · loaded patch checks'}</Text></View>
  {findings.slice(0,8).map((finding,index)=><Text key={index} style={{color:colors.text}}>{finding.severity.toUpperCase()} · {finding.file}{finding.line?`:${finding.line}`:''}: {finding.message}</Text>)}
  {findings.length>8&&<Text style={{color:colors.textSecondary}}>{findings.length-8} more findings. Inspect all loaded patches.</Text>}
  {!findings.length&&<Text style={{color:colors.text}}>0 detected mock shortcuts · 0 detected auth guard removals{coverage.dependenciesKnown?' · 0 undeclared imports':' · Dependency scan unavailable'}</Text>}
  <Text style={{color:colors.textSecondary}}>{coverage.checked}/{coverage.total} loaded production patches checked. {coverage.complete?'Loaded-file patch coverage complete.':'Coverage incomplete; unavailable or partial patches are not a clean scan.'} Heuristics guide review; they cannot prove code or authentication safe.</Text>
 </View>;
}
