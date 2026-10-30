import React from 'react';
import { View } from 'react-native';
import { Text } from './Text';
import { Icon } from './Icon';
import { RiskBadge } from './RiskBadge';
import { Section } from './ScreenDesign';
import { useTheme } from '../context/ThemeContext';

/** Explicit sample content illustrating the product; never presented as live data. */
export function OnboardingPreview({step}:{step:number}) {
  const {colors,typography}=useTheme();
  if(step===1)return <View style={{gap:8}}>{(['low','medium','high'] as const).map((risk,index)=><Section key={risk} style={{padding:14}}><RiskBadge level={risk}/><Text style={[typography.subhead,{color:colors.text,marginTop:8,fontSize:15}]}>{['Pure docs & unit tests','Database migration update','Authentication boundary'][index]}</Text><Text style={[typography.code,{color:colors.textSecondary,marginTop:4,fontSize:11}]}>{['docs/setup.md','prisma/schema.sql','middleware/session.ts'][index]}</Text></Section>)}</View>;
  return <Section style={{padding:16}}>
    <View style={{flexDirection:'row',gap:8,alignItems:'center'}}><Icon name={step===2?'shield-checkmark-outline':'git-pull-request-outline'} size={18} color={colors.brandLight}/><Text style={[typography.code,{color:colors.textSecondary,fontSize:11}]}>SAMPLE · octocat/review-app</Text></View>
    <Text style={[typography.headline,{color:colors.text,marginTop:12}]}>Refactor token validation</Text><Text style={[typography.code,{color:colors.textSecondary,marginTop:8,fontSize:11}]}>feature/auth-v2 → main</Text>
    <View style={{padding:12,borderRadius:12,backgroundColor:colors.surfaceElevated,marginTop:14}}><View style={{flexDirection:'row',gap:8}}><Icon name="sparkles" size={16} color={colors.brandLight}/><Text style={[typography.subhead,{color:colors.brandLight}]}>AI Summary</Text></View><Text style={[typography.callout,{color:colors.textSecondary,marginTop:8}]}>Replaces the old token parser with a scoped session check. Focus your review on the authentication boundary.</Text></View>
    <View style={{flexDirection:'row',gap:8,alignItems:'center',marginTop:12}}><Icon name="checkmark-circle" size={16} color={colors.riskLow}/><Text style={[typography.footnote,{color:colors.textSecondary}]}>Checks passing</Text><RiskBadge level="low" compact/></View>
    {step===2 && <View style={{backgroundColor:colors.brandSubtle,padding:12,borderRadius:12,marginTop:12,flexDirection:'row',gap:8,alignItems:'center'}}><Icon name="open-outline" size={18} color={colors.brandLight}/><Text style={[typography.subhead,{color:colors.brandLight}]}>Review and act in GitHub</Text></View>}
  </Section>;
}
