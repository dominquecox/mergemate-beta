import React,{useCallback,useEffect,useRef,useState} from 'react';
import {AppState,Platform,TouchableOpacity,View,type LayoutChangeEvent,type GestureResponderEvent} from 'react-native';
import {useFocusEffect} from 'expo-router';
import {api} from '../api';
import {AI_CONSENT_VERSION} from '../config/consent';
import {onSessionChange} from '../auth/session-events';
import {useTheme} from '../context/ThemeContext';
import {startVoiceCapture,createVoicePreview} from '../voice/driver';
import {EMPTY_RECORDING,type VoiceCapture,type VoicePreview,type VoiceStatus} from '../voice/pcm';
import {Icon} from './Icon';
import {Button} from './Button';
import {Text} from './Text';

type Phase='idle'|'starting'|'recording'|'paused'|'ready'|'stopping'|'transcribing';
/** Unsaved audio and transcript live only in this screen's memory. */
export function VoiceNoteRecorder({onTranscript,onBusyChange}:{onTranscript:(text:string)=>void;onBusyChange:(busy:boolean)=>void}){
 const {colors,typography}=useTheme();
 const [cleanupFailed,setCleanupFailed]=useState(false);
 const [seconds,setSeconds]=useState(0);
 const [phase,setPhase]=useState<Phase>('idle'),[error,setError]=useState<string|null>(null);
 const [playback,setPlayback]=useState<VoiceStatus|null>(null);
 const capture=useRef<VoiceCapture|null>(null),preview=useRef<VoicePreview|null>(null),bytes=useRef<Uint8Array|null>(null),controller=useRef<AbortController|null>(null),generation=useRef(0);
 const phaseRef=useRef<Phase>('idle');const set=(value:Phase)=>{phaseRef.current=value;onBusyChange(value!=='idle');setPhase(value);};
 const dispose=useCallback(async()=>{
  generation.current++;controller.current?.abort();controller.current=null;
  const active=capture.current,playback=preview.current;capture.current=null;preview.current=null;bytes.current?.fill(0);bytes.current=null;
  const outcomes=await Promise.allSettled([active?.dispose(),playback?.dispose()]);
  if(outcomes.some(result=>result.status==='rejected'))throw new Error('Audio cleanup failed. Close the app and clear its local data before recording again.');
 },[]);
 const cancel=useCallback(async()=>{setPlayback(null);try{await dispose();set('idle');}catch{setCleanupFailed(true);set('idle');setError('Audio cleanup failed. Close the app and clear its local data before recording again.');}},[dispose]);
 useEffect(()=>()=>onBusyChange(false),[onBusyChange]);
 useFocusEffect(useCallback(()=>()=>{void dispose().catch(()=>{});},[dispose]));
 useEffect(()=>{
  const stop=()=>{void cancel();};
  const app=AppState.addEventListener('change',state=>{if(state!=='active')stop();});
  const off=onSessionChange(stop);
  const hidden=()=>{if(document.visibilityState!=='visible')stop();};
  if(Platform.OS==='web'){document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',stop);}
  return()=>{app.remove();off();if(Platform.OS==='web'){document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',stop);}void dispose().catch(()=>{});};
 },[cancel,dispose]);
 const stop=async()=>{
  if(!capture.current || !['recording','paused'].includes(phaseRef.current))return;
  set('stopping');const version=generation.current,active=capture.current;capture.current=null;
  try{const data=await active.stop();if(version!==generation.current){data.fill(0);return;}const playback=await createVoicePreview(data);if(version!==generation.current){await playback.dispose();data.fill(0);return;}bytes.current=data;preview.current=playback;setPlayback(playback.status());playback.onStatus(value=>{if(preview.current===playback){setPlayback(value);if(value.error)setError(value.error);}});set('ready');}
  catch(failure){if(version===generation.current){await dispose().catch(()=>{});set('idle');setError(failure instanceof Error&&failure.message===EMPTY_RECORDING?EMPTY_RECORDING:'Could not finish the recording. Try again or type a note.');}}
 };
 const stopRef=useRef(stop);stopRef.current=stop;
 const start=async()=>{
  if(cleanupFailed || phaseRef.current!=='idle')return;set('starting');setSeconds(0);setError(null);const version=++generation.current;const abort=new AbortController();controller.current=abort;
  try{
   const [flags,consent]=await Promise.all([api.getFeatureFlags(true),api.getConsent()]);
   if(version!==generation.current)return;
   if(!flags.voice_notes || !consent.ai.granted || consent.ai.version!==AI_CONSENT_VERSION)throw new Error('Voice notes are unavailable. Check AI consent in Settings.');
   const active=await startVoiceCapture(()=>{void stopRef.current();},value=>{if(version===generation.current)setSeconds(Math.floor(value));},abort.signal);
   if(version!==generation.current){await active.dispose();return;}capture.current=active;set('recording');
  }catch(error){if(version===generation.current){set('idle');setError(error instanceof Error ? error.message : 'Microphone unavailable. Type a private note instead.');}}
 };
 const transcribe=async()=>{
  if(phaseRef.current!=='ready'||!bytes.current)return;set('transcribing');setError(null);preview.current?.pause();const version=generation.current;controller.current=new AbortController();
  let text:string;
  try{text=await api.transcribeVoice(bytes.current,controller.current.signal);}
  catch{if(version===generation.current){set('ready');setError('Could not transcribe this recording. Try again or cancel and type a note.');}return;}
  if(version!==generation.current)return;
  try{await dispose();}catch{setCleanupFailed(true);setError('Audio cleanup failed. Close the app and clear its local data before recording again.');}
  setPlayback(null);onTranscript(text);set('idle');
 };
 const toggle=async()=>{
  const active=preview.current;if(!active)return;
  if(active.status().playing){active.pause();return;}
  try{setError(null);await active.play();}catch{setError('Could not play this recording. You can still transcribe it or record again.');}
 };
 const busy=phase==='starting'||phase==='stopping'||phase==='transcribing';
 return <View style={{gap:8,marginVertical:12}}>
  <Text style={[typography.body,{color:colors.textSecondary}]} accessibilityLiveRegion="polite">{phase==='recording'?`Recording ${clock(seconds)} / 2:00`:phase==='paused'?`Recording paused at ${clock(seconds)} / 2:00`:phase==='stopping'?'Finishing the recording…':phase==='ready'?'Listen back, then transcribe and review the text before saving.':phase==='transcribing'?'Transcribing…':phase==='starting'?'Waiting for microphone access…':'Record up to 2 minutes. Audio is sent only when you choose Transcribe, and discarded after.'}</Text>
  {!!error && <Text accessibilityRole="alert" style={{color:colors.riskHigh}}>{error}</Text>}
  {phase==='idle' && <Button title="Record voice note" disabled={cleanupFailed} onPress={start} variant="secondary"/>}
  {phase==='starting' && <Button title="Starting the microphone…" disabled loading onPress={()=>{}} variant="secondary"/>}
  {phase==='recording' && <Button title="Pause recording" variant="secondary" onPress={()=>{capture.current?.pause();set('paused');}}/>}
  {phase==='paused' && <Button title="Resume recording" variant="secondary" onPress={()=>{capture.current?.resume();set('recording');}}/>}
  {(phase==='recording'||phase==='paused'||phase==='stopping') && <Button title={phase==='stopping'?'Stopping…':'Stop recording'} disabled={phase==='stopping'} loading={phase==='stopping'} onPress={stop}/>}
  {(phase==='ready'||phase==='transcribing') && playback && <View style={{flexDirection:'row',alignItems:'center',gap:10}}>
   <TouchableOpacity onPress={()=>void toggle()} disabled={phase!=='ready'} accessibilityRole="button" accessibilityLabel={playback.playing?'Pause playback':'Play recording'}
    style={{width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center',backgroundColor:colors.brandSubtle,opacity:phase==='ready'?1:0.5}}>
    <Icon name={playback.playing?'pause':'play'} size={20} color={colors.brandLight}/>
   </TouchableOpacity>
   <SeekBar position={playback.position} duration={playback.duration} disabled={phase!=='ready'} onSeek={value=>preview.current?.seek(value)}/>
   <Text style={[typography.caption,{color:colors.textSecondary,minWidth:72,textAlign:'right'}]} accessibilityLabel={`${clock(playback.position)} of ${clock(playback.duration)}`}>{clock(playback.position)} / {clock(playback.duration)}</Text>
  </View>}
  {(phase==='ready'||phase==='transcribing') && <Button title={phase==='transcribing'?'Transcribing…':'Transcribe'} loading={phase==='transcribing'} disabled={phase==='transcribing'} onPress={transcribe}/>}
  {phase!=='idle' && !busy && <Button title={phase==='ready'?'Discard and record again':'Cancel recording'} onPress={cancel} variant="ghost"/>}
  {phase==='transcribing' && <Button title="Cancel" onPress={cancel} variant="ghost"/>}
 </View>;
}

const clock=(value:number)=>{const total=Math.max(0,Math.floor(Number.isFinite(value)?value:0));return `${Math.floor(total/60)}:${String(total%60).padStart(2,'0')}`;};

/** A scrubbable seek bar with a 44px touch target; screen readers step it by 5 seconds. */
function SeekBar({position,duration,disabled,onSeek}:{position:number;duration:number;disabled:boolean;onSeek:(seconds:number)=>void}){
 const {colors}=useTheme();const width=useRef(1);
 const fraction=duration>0?Math.max(0,Math.min(1,position/duration)):0;
 const seekTo=(event:GestureResponderEvent)=>{if(disabled||duration<=0)return;onSeek(Math.max(0,Math.min(1,event.nativeEvent.locationX/width.current))*duration);};
 return <View
  onLayout={(event:LayoutChangeEvent)=>{width.current=Math.max(1,event.nativeEvent.layout.width);}}
  onStartShouldSetResponder={()=>!disabled} onMoveShouldSetResponder={()=>!disabled} onResponderGrant={seekTo} onResponderMove={seekTo}
  accessible accessibilityRole="adjustable" accessibilityLabel="Playback position" accessibilityValue={{min:0,max:Math.round(duration),now:Math.round(position),text:`${clock(position)} of ${clock(duration)}`}}
  accessibilityActions={[{name:'increment'},{name:'decrement'}]}
  onAccessibilityAction={event=>{if(disabled)return;onSeek(Math.max(0,Math.min(duration,position+(event.nativeEvent.actionName==='increment'?5:-5))));}}
  style={{flex:1,height:44,justifyContent:'center'}}>
  <View pointerEvents="none" style={{height:4,borderRadius:2,backgroundColor:colors.border}}>
   <View style={{width:`${fraction*100}%`,height:4,borderRadius:2,backgroundColor:colors.brandLight}}/>
  </View>
  <View pointerEvents="none" style={{position:'absolute',left:`${fraction*100}%`,marginLeft:-7,width:14,height:14,borderRadius:7,backgroundColor:colors.brandLight}}/>
 </View>;
}
