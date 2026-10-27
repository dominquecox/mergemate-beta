import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Text } from './Text';
import { Icon, type IconName } from './Icon';
import { useTheme } from '../context/ThemeContext';

export function SettingsGroup({title,children}:{title:string;children:React.ReactNode}) {
  const {colors,typography}=useTheme();
  return <View style={{marginBottom:20}}><Text accessibilityRole="header" style={[typography.caption,{color:colors.textSecondary,textTransform:'uppercase',letterSpacing:0.8,marginBottom:8,marginLeft:4}]}>{title}</Text><View style={{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:16,overflow:'hidden'}}>{children}</View></View>;
}
export function SettingsRow({label,detail,icon,trailing,onPress,danger=false,first=false}:{label:string;detail?:string;icon?:IconName;trailing?:React.ReactNode;onPress?:()=>void;danger?:boolean;first?:boolean}) {
  const {colors,typography}=useTheme();
  const content=<><View style={{flexDirection:'row',alignItems:'center',gap:10,flex:1,minWidth:0}}>{icon && <Icon name={icon} size={18} color={danger?colors.riskHigh:colors.textSecondary}/>}<View style={{flex:1}}><Text style={[typography.body,{color:danger?colors.riskHigh:colors.text,fontWeight:'500'}]}>{label}</Text>{detail && <Text style={[typography.caption,{color:colors.textSecondary,marginTop:3}]}>{detail}</Text>}</View></View>{trailing ?? (onPress && <Icon name="chevron-forward" size={16} color={colors.textSecondary}/>)}</>;
  const style={minHeight:52,paddingHorizontal:16,paddingVertical:12,flexDirection:'row' as const,alignItems:'center' as const,gap:12,borderTopWidth:first?0:1,borderTopColor:colors.border};
  return onPress?<TouchableOpacity accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={style}>{content}</TouchableOpacity>:<View style={style}>{content}</View>;
}
