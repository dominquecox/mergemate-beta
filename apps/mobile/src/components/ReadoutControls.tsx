import React,{useCallback,useEffect,useState} from 'react';
import {View} from 'react-native';
import {useFocusEffect} from 'expo-router';
import {useReadout} from '../readout/ReadoutContext';
import {useTheme} from '../context/ThemeContext';
import {Button} from './Button';
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
  return <View style={{padding:12,gap:8,borderColor:colors.border,borderWidth:1,borderRadius:12,margin:16}} accessibilityLabel={label}>
    <Text style={[typography.subhead,{color:colors.text}]} accessibilityRole="header">{label}</Text>
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
      <Button title={state==='paused'?'Resume':'Play'} accessibilityLabel={`${state==='paused'?'Resume':'Play'} ${label}`} disabled={state==='playing'||sentences.length===0} onPress={()=>controller.play(sentences)}/>
      <Button title="Pause" accessibilityLabel={`Pause ${label}`} disabled={state!=='playing'} variant="secondary" onPress={()=>controller.pause()}/>
      <Button title="Stop" accessibilityLabel={`Stop ${label}`} disabled={state==='stopped'} variant="secondary" onPress={()=>controller.stop()}/>
      <Button title={`${controller.rate}× speed`} accessibilityLabel="Change readout speed" variant="secondary" onPress={()=>{const rates=[0.75,1,1.25,1.5];return controller.speed(rates[(rates.indexOf(controller.rate)+1)%rates.length]!);}}/>
    </View>
    <Text accessibilityLiveRegion="polite" style={[typography.caption,{color:colors.textSecondary}]}>{state==='unavailable'?'No installed local voice is available. Install a device voice, then try Play again.':state==='error'?'Readout stopped. Try Play again.':sentences.length===0?'No safe plain text is available to read.':state==='paused'?'Paused. On devices without pause support, Resume repeats the current sentence.':state==='playing'?'Reading with a local device voice.':'Read aloud on this device.'}</Text>
  </View>;
}
