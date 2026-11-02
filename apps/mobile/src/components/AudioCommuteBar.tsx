import React,{useCallback,useEffect,useRef,useState} from 'react';
import {Animated,AppState,Platform,View} from 'react-native';
import {useFocusEffect} from 'expo-router';
import {useReadout} from '../readout/ReadoutContext';
import {useTheme} from '../context/ThemeContext';
import {Button} from './Button';
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
 const hint=!enabled?'Local device readout is disabled for this environment.':controller.state==='unavailable'?'No installed local voice is available. Install a device voice and retry.':controller.state==='error'?'Narration stopped. Try again.':paused?'Paused.':playing?'Playing with a local device voice; text stays on device.':'Local voice only. No AI or audio upload.';
 return <View testID="audio-commute-bar" style={{padding:12,borderWidth:1,borderColor:colors.border,borderRadius:20,marginVertical:8,gap:8}}>
  <View style={{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:8}}>
   <Button title={playing?'Pause Executive Digest':paused?'Resume Executive Digest':'Listen to Executive Digest'} icon={<Icon name="headset-outline" color={colors.brandLight}/>} variant="secondary" disabled={!enabled||!sentences.length} onPress={()=>playing?controller.pause():controller.play(sentences)}/>
   <Button title={`${controller.rate}x`} accessibilityLabel="Change commute narration speed" variant="ghost" disabled={!enabled} onPress={()=>{const rates=[1,1.25,1.5];return controller.speed(rates[(rates.indexOf(controller.rate)+1)%rates.length]??1);}}/>
   {(playing||paused)&&<Button title="Stop Digest" variant="ghost" onPress={()=>controller.stop()}/>}
   {playing&&<Animated.View accessibilityLabel="Digest playing" style={{width:10,height:10,borderRadius:5,backgroundColor:colors.brand,opacity:pulse}}/>}
  </View>
  <Text accessibilityLiveRegion="polite" style={{color:colors.textSecondary}}>{hint}</Text>
 </View>;
}
