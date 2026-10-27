import React, {useRef,useState} from 'react';
import { View, Pressable } from 'react-native';
import { Text } from './Text';
import { Icon, type IconName } from './Icon';
import { useTheme } from '../context/ThemeContext';
import { androidRipple } from '../platform/android';

export function SettingsGroup({title,children}:{title:string;children:React.ReactNode}) {
  const {colors,typography}=useTheme();
  return <View style={{marginBottom:20}}><Text accessibilityRole="header" style={[typography.caption,{color:colors.textSecondary,textTransform:'uppercase',letterSpacing:0.8,marginBottom:8,marginLeft:4}]}>{title}</Text><View style={{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:16,overflow:'hidden'}}>{children}</View></View>;
}
export function SettingsRow({label,detail,icon,trailing,onPress,danger=false,first=false}:{label:string;detail?:string;icon?:IconName;trailing?:React.ReactNode;onPress?:()=>void;danger?:boolean;first?:boolean}) {
  const {colors,typography}=useTheme();
  const lock=useRef(false);
  const [pending,setPending]=useState(false);
  const invoke=async()=>{if(lock.current)return;lock.current=true;setPending(true);try{await onPress?.();}finally{lock.current=false;setPending(false);}};
  const content=<><View style={{flexDirection:'row',alignItems:'center',gap:10,flex:1,minWidth:0}}>{icon && <Icon name={icon} size={18} color={danger?colors.riskHigh:colors.textSecondary}/>}<View style={{flex:1}}><Text style={[typography.body,{color:danger?colors.riskHigh:colors.text,fontWeight:'500'}]}>{label}</Text>{detail && <Text style={[typography.caption,{color:colors.textSecondary,marginTop:3}]}>{detail}</Text>}</View></View>{trailing ?? (onPress && <Icon name="chevron-forward" size={16} color={colors.textSecondary}/>)}</>;
  const style={minHeight:52,paddingHorizontal:16,paddingVertical:12,flexDirection:'row' as const,alignItems:'center' as const,gap:12,borderTopWidth:first?0:1,borderTopColor:colors.border};
  return onPress?<Pressable accessibilityRole="button" accessibilityLabel={label} disabled={pending} accessibilityState={{disabled:pending,busy:pending}} onPress={invoke} android_ripple={androidRipple()} style={({pressed})=>[style,pressed && {opacity:0.85}]}>{content}</Pressable>:<View style={style}>{content}</View>;
}
