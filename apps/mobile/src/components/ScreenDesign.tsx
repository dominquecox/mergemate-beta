import React from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import { Text } from './Text';
import { Icon, type IconName } from './Icon';
import { useTheme } from '../context/ThemeContext';

export function Section({title,caption,icon,children,style}:{title?:string;caption?:string;icon?:IconName;children:React.ReactNode;style?:ViewStyle}) {
  const {colors,typography}=useTheme();
  return <View style={[styles.section,{backgroundColor:colors.surface,borderColor:colors.border},style]}>
    {!!title && <View style={[styles.row,{marginBottom:12}]}>{icon && <Icon name={icon} size={18} color={colors.brandLight}/>}<Text accessibilityRole="header" style={[typography.headline,{color:colors.text,flex:1}]}>{title}</Text></View>}
    {!!caption && <Text style={[typography.footnote,{color:colors.textSecondary,marginBottom:12}]}>{caption}</Text>}{children}
  </View>;
}
export function InfoLine({icon,title,detail}:{icon:IconName;title:string;detail:string}) {
  const {colors,typography}=useTheme();
  return <View style={[styles.row,{alignItems:'flex-start',paddingVertical:12}]}><View style={[styles.icon,{backgroundColor:colors.brandSubtle}]}><Icon name={icon} size={18} color={colors.brandLight}/></View><View style={{flex:1}}><Text style={[typography.subhead,{color:colors.text,fontWeight:'600'}]}>{title}</Text><Text style={[typography.footnote,{color:colors.textSecondary,marginTop:4}]}>{detail}</Text></View></View>;
}
export const screenStyles=StyleSheet.create({
  content:{padding:16,paddingBottom:40,gap:16},
  input:{minHeight:48,borderWidth:1,borderRadius:12,paddingHorizontal:14,paddingVertical:12},
  label:{letterSpacing:1,textTransform:'uppercase',marginBottom:8},
  divider:{borderTopWidth:1,marginVertical:12},
});
const styles=StyleSheet.create({intro:{paddingVertical:12},row:{flexDirection:'row',alignItems:'center',gap:8},section:{borderWidth:1,borderRadius:16,padding:20},icon:{width:36,height:36,borderRadius:10,alignItems:'center',justifyContent:'center'}});
