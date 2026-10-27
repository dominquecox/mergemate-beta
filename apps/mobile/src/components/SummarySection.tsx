import React from 'react';
import { View } from 'react-native';
import { Text } from './Text';
import { Icon, type IconName } from './Icon';
import { useTheme } from '../context/ThemeContext';

export function SummarySection({title,icon,children}:{title:string;icon:IconName;children:React.ReactNode}) {
  const {colors,typography}=useTheme();
  return <View style={{padding:12,borderRadius:12,backgroundColor:colors.surfaceElevated,gap:8}}><View style={{flexDirection:'row',gap:8,alignItems:'center'}}><Icon name={icon} size={16} color={colors.brandLight}/><Text style={[typography.subhead,{color:colors.brandLight}]}>{title}</Text></View>{children}</View>;
}
