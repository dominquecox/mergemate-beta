import React,{useCallback,useEffect,useRef,useState} from 'react';
import {Animated,AppState,Platform,View,TouchableOpacity} from 'react-native';
import {useFocusEffect} from 'expo-router';
import {useReadout} from '../readout/ReadoutContext';
import {useTheme} from '../context/ThemeContext';
import {Text} from './Text';
import {Icon} from './Icon';
/** Local-only driver and the existing voice flag; background/navigation always cancel narration. */
export function AudioCommuteBar({sentences}:{sentences:string[]}){
 const {enabled,controller}=useReadout(),{colors}=useTheme(),[,render]=useState(0),pulse=useRef(new Animated.Value(1)).current;
 useEffect(()=>controller.subscribe(()=>render(n=>n+1)),[controller]);
 const key=sentences.join('\n');
 useEffect(()=>()=>{void controller.stop();},[controller,key]);
 useFocusEffect(useCallback(()=>()=>{void controller.stop();},[controller]));
 useEffect(()=>{const sub=AppState.addEventListener('change',state=>{if(state!=='active')void controller.stop();});const hidden=()=>{if(document.visibilityState!=='visible')void controller.stop();};if(Platform.OS==='web')document.addEventListener('visibilitychange',hidden);return()=>{sub.remove();if(Platform.OS==='web')document.removeEventListener('visibilitychange',hidden);};},[controller]);
 const playing=controller.state==='playing',paused=controller.state==='paused';
 useEffect(()=>{if(!playing){pulse.setValue(1);return;}const animation=Animated.loop(Animated.sequence([Animated.timing(pulse,{toValue:0.35,duration:650,useNativeDriver:Platform.OS!=='web'}),Animated.timing(pulse,{toValue:1,duration:650,useNativeDriver:Platform.OS!=='web'})]));animation.start();return()=>animation.stop();},[playing,pulse]);
 if(!enabled)return null;
 const label=playing?'Pause Executive Digest':paused?'Resume Executive Digest':'Listen to Executive Digest';
 return <View testID="audio-commute-bar" style={{flexDirection:'row',alignItems:'center',gap:2}}>
  <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} accessibilityHint={controller.state==='unavailable'?'No installed local voice. Install one and retry.':'Local device voice. No audio upload.'} disabled={!sentences.length} onPress={()=>void(playing?controller.pause():controller.play(sentences))} style={{minHeight:44,width:44,alignItems:'center',justifyContent:'center'}}><Animated.View style={{opacity:playing?pulse:1}}><Icon name={playing?'pause-outline':paused?'play-outline':'headset-outline'} color={colors.brandLight}/></Animated.View></TouchableOpacity>
  {(playing||paused)&&<>
   <TouchableOpacity accessibilityRole="button" accessibilityLabel="Change commute narration speed" onPress={()=>{const rates=[1,1.25,1.5];void controller.speed(rates[(rates.indexOf(controller.rate)+1)%rates.length]??1);}} style={{minHeight:44,minWidth:44,alignItems:'center',justifyContent:'center'}}><Text style={{color:colors.textSecondary}}>{controller.rate}x</Text></TouchableOpacity>
   <TouchableOpacity accessibilityRole="button" accessibilityLabel="Stop Digest" onPress={()=>void controller.stop()} style={{minHeight:44,width:44,alignItems:'center',justifyContent:'center'}}><Icon name="stop-outline" color={colors.textSecondary}/></TouchableOpacity>
  </>}
 </View>;
}
