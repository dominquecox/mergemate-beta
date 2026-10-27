import React from 'react';
import { View } from 'react-native';
import { Text } from './Text';
import { useTheme } from '../context/ThemeContext';

/** Initial avatar avoids additional remote image requests in a review feed. */
export function Avatar({login,size=32}:{login:string;size?:number}) {
  const {colors,typography}=useTheme();
  return <View accessibilityRole="image" accessibilityLabel={`${login} avatar`} style={{width:size,height:size,borderRadius:size/2,backgroundColor:colors.brandSubtle,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center'}}><Text style={[typography.caption,{color:colors.brandLight}]}>{login.slice(0,2).toUpperCase() || '?'}</Text></View>;
}
