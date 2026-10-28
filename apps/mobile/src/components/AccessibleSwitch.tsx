import React from 'react';
import {Platform,Pressable,Switch as NativeSwitch,View,type SwitchProps} from 'react-native';
import {useTheme} from '../context/ThemeContext';
type Props=Pick<SwitchProps,'value'|'onValueChange'|'disabled'|'accessibilityLabel'|'trackColor'|'thumbColor'>;
/** The interactive target is at least52x44; the approved40x20 visual track stays compact. */
export function AccessibleSwitch({value=false,onValueChange,disabled=false,accessibilityLabel,trackColor,thumbColor}:Props){
  const {colors}=useTheme();
  const change=()=>{if(!disabled)onValueChange?.(!value);};
  if(Platform.OS==='web'){
    const track=value?trackColor?.true:trackColor?.false;
    return <button type="button" role="switch" aria-checked={value} aria-label={accessibilityLabel} aria-disabled={disabled} onClick={change} style={{width:52,minWidth:52,height:44,minHeight:44,flexShrink:0,padding:6,border:0,background:'transparent',display:'flex',alignItems:'center',justifyContent:'center',cursor:disabled?'default':'pointer',opacity:disabled ? 0.5 : 1,borderRadius:8}}>
      <span aria-hidden="true" style={{display:'block',width:40,height:20,borderRadius:10,background:typeof track==='string'?track:value?colors.brand:colors.surfaceSecondary,position:'relative'}}><span style={{display:'block',position:'absolute',width:16,height:16,top:2,left:value?22:2,borderRadius:8,background:typeof thumbColor==='string'?thumbColor:'#FFFFFF'}}/></span>
    </button>;
  }
  return <Pressable accessibilityRole="switch" accessibilityLabel={accessibilityLabel} accessibilityState={{checked:value,disabled}} disabled={disabled} onPress={change} style={{minWidth:52,minHeight:44,flexShrink:0,alignItems:'center',justifyContent:'center'}}>
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><NativeSwitch value={value} disabled={disabled} accessible={false} focusable={false} trackColor={trackColor} thumbColor={thumbColor}/></View>
  </Pressable>;
}
