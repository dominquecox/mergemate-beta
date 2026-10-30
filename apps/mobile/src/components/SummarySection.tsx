import React from 'react';
import { View } from 'react-native';
import { Text } from './Text';
import { Icon, type IconName } from './Icon';
import { useTheme } from '../context/ThemeContext';

/** One labelled part of the AI summary. Flat on purpose: the surrounding AI card already provides the surface. */
export function SummarySection({title,icon,children}:{title:string;icon:IconName;children:React.ReactNode}) {
  const {colors,typography}=useTheme();
  return <View style={{gap:4,paddingTop:12,borderTopWidth:1,borderTopColor:colors.border}}><View style={{flexDirection:'row',gap:6,alignItems:'center'}}><Icon name={icon} size={14} color={colors.textMuted}/><Text style={[typography.caption,{color:colors.textMuted,letterSpacing:0.4}]}>{title}</Text></View>{children}</View>;
}
