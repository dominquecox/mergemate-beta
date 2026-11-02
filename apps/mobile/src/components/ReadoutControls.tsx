import React,{useCallback,useEffect,useState} from 'react';
import {Pressable,View} from 'react-native';
import {useFocusEffect} from 'expo-router';
import {useReadout} from '../readout/ReadoutContext';
import {useTheme} from '../context/ThemeContext';
import {Icon} from './Icon';
import {Text} from './Text';
/** Reads only supplied, already filtered screen text. Never requests AI analysis. */
export function ReadoutControls({sentences,label}:{sentences:string[];label:string}){
  const {enabled,controller}=useReadout();const {colors,typography}=useTheme();const [,render]=useState(0);
  useEffect(()=>controller.subscribe(()=>render(value=>value+1)),[controller]);
  const textKey=sentences.join('\n');
  useEffect(()=>()=>{void controller.stop();},[controller,textKey]);
  useFocusEffect(useCallback(()=>()=>{void controller.stop();},[controller]));
  if(!enabled)return null;
  const state=controller.state;
  const playing=state==='playing',paused=state==='paused';
  const toggleLabel=`${playing?'Pause':paused?'Resume':'Play'} ${label}`;
  const hint=state==='unavailable'?'No installed local voice is available. Install a device voice, then try Play again.':state==='error'?'Readout stopped. Try Play again.':sentences.length===0?'No safe plain text is available to read.':paused?'Paused. On devices without pause support, Resume repeats the current sentence.':playing?'Reading with a local device voice.':'';
  const chip={minHeight:44,minWidth:44,paddingHorizontal:8,alignItems:'center' as const,justifyContent:'center' as const,borderRadius:16,flexDirection:'row' as const,gap:4};
  return <View style={{marginHorizontal:16,marginVertical:8,paddingVertical:6,paddingLeft:12,paddingRight:8,borderColor:colors.border,borderWidth:1,borderRadius:12,gap:4}} accessibilityLabel={label}>
    <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
      <Pressable accessibilityRole="button" accessibilityLabel={toggleLabel} disabled={!playing&&sentences.length===0} onPress={()=>playing?controller.pause():controller.play(sentences)} hitSlop={6} style={({pressed})=>[chip,{backgroundColor:colors.brandSubtle,opacity:(!playing&&sentences.length===0)?0.5:pressed?0.8:1}]}>
        <Icon name={playing?'pause':'play'} size={16} color={colors.brandLight}/>
      </Pressable>
      <Text style={[typography.subhead,{color:colors.text,flex:1}]} accessibilityRole="header">{label}</Text>
      {state!=='stopped'&&<Pressable accessibilityRole="button" accessibilityLabel={`Stop ${label}`} onPress={()=>controller.stop()} hitSlop={6} style={chip}><Icon name="stop" size={14} color={colors.textSecondary}/></Pressable>}
      <Pressable accessibilityRole="button" accessibilityLabel="Change readout speed" onPress={()=>{const rates=[0.75,1,1.25,1.5];return controller.speed(rates[(rates.indexOf(controller.rate)+1)%rates.length]!);}} hitSlop={6} style={chip}><Text style={[typography.caption,{color:colors.textSecondary}]}>{controller.rate}×</Text></Pressable>
    </View>
    {!!hint&&<Text accessibilityLiveRegion="polite" style={[typography.caption,{color:colors.textSecondary}]}>{hint}</Text>}
  </View>;
}
