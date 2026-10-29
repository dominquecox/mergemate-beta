import React,{useCallback,useEffect,useRef,useState} from 'react';
import {AppState,Platform,View} from 'react-native';
import {useFocusEffect} from 'expo-router';
import {api} from '../api';
import {onSessionChange} from '../auth/session-events';
import {useTheme} from '../context/ThemeContext';
import {startVoiceCapture,createVoicePreview} from '../voice/driver';
import type {VoiceCapture,VoicePreview} from '../voice/pcm';
import {Button} from './Button';
import {Text} from './Text';

type Phase='idle'|'starting'|'recording'|'paused'|'ready'|'stopping'|'transcribing';
/** Unsaved audio and transcript live only in this screen's memory. */
export function VoiceNoteRecorder({onTranscript,onBusyChange}:{onTranscript:(text:string)=>void;onBusyChange:(busy:boolean)=>void}){
 const {colors,typography}=useTheme();
 const [cleanupFailed,setCleanupFailed]=useState(false);
 const [seconds,setSeconds]=useState(0);
 const [phase,setPhase]=useState<Phase>('idle'),[error,setError]=useState<string|null>(null);
 const capture=useRef<VoiceCapture|null>(null),preview=useRef<VoicePreview|null>(null),bytes=useRef<Uint8Array|null>(null),controller=useRef<AbortController|null>(null),generation=useRef(0);
 const phaseRef=useRef<Phase>('idle');const set=(value:Phase)=>{phaseRef.current=value;onBusyChange(value!=='idle');setPhase(value);};
 const dispose=useCallback(async()=>{
  generation.current++;controller.current?.abort();controller.current=null;
  const active=capture.current,playback=preview.current;capture.current=null;preview.current=null;bytes.current?.fill(0);bytes.current=null;
  const outcomes=await Promise.allSettled([active?.dispose(),playback?.dispose()]);
  if(outcomes.some(result=>result.status==='rejected'))throw new Error('Audio cleanup failed. Close the app and clear its local data before recording again.');
 },[]);
 const cancel=useCallback(async()=>{try{await dispose();set('idle');}catch{setCleanupFailed(true);set('idle');setError('Audio cleanup failed. Close the app and clear its local data before recording again.');}},[dispose]);
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
  try{const data=await active.stop();if(version!==generation.current){data.fill(0);return;}const playback=await createVoicePreview(data);if(version!==generation.current){await playback.dispose();data.fill(0);return;}bytes.current=data;preview.current=playback;set('ready');}
  catch{if(version===generation.current){await dispose().catch(()=>{});set('idle');setError('Could not finish the recording. Try again or type a note.');}}
 };
 const stopRef=useRef(stop);stopRef.current=stop;
 const start=async()=>{
  if(cleanupFailed || phaseRef.current!=='idle')return;set('starting');setSeconds(0);setError(null);const version=++generation.current;const abort=new AbortController();controller.current=abort;
  try{
   const [flags,consent]=await Promise.all([api.getFeatureFlags(true),api.getConsent()]);
   if(version!==generation.current)return;
   if(!flags.voice_notes || !consent.ai.granted || consent.ai.version!=='1')throw new Error('Voice notes are unavailable. Check AI consent in Settings.');
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
  onTranscript(text);set('idle');
 };
 return <View style={{gap:8,marginVertical:12}}>
  <Text style={[typography.body,{color:colors.textSecondary}]} accessibilityLiveRegion="polite">{phase==='recording'?'Recording. Stops automatically at 2 minutes.':phase==='paused'?'Recording paused.':phase==='ready'?'Recording ready. Play it back, then transcribe and review the text before saving.':phase==='transcribing'?'Transcribing. You can cancel.':phase==='starting'?'Waiting for microphone access…':'Record up to 2 minutes. Audio is sent only when you choose Transcribe. It is discarded after successful transcription, or when you cancel or leave.'}</Text>
  {phase==='recording' && <Text style={[typography.body,{color:colors.textSecondary}]}>{Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')} / 2:00</Text>}
  {error && <Text accessibilityRole="alert" style={{color:colors.riskHigh}}>{error}</Text>}
  {phase==='idle' && <Button title="Record voice note" disabled={cleanupFailed} onPress={start} variant="secondary"/>}
  {phase==='recording' && <Button title="Pause recording" variant="secondary" onPress={()=>{capture.current?.pause();set('paused');}}/>}
  {phase==='paused' && <Button title="Resume recording" variant="secondary" onPress={()=>{capture.current?.resume();set('recording');}}/>}
  {(phase==='recording'||phase==='paused') && <Button title="Stop recording" onPress={stop}/>}
  {phase==='ready' && <><Button title="Play recording" variant="secondary" onPress={async()=>{try{await preview.current?.play();}catch{setError('Could not play this recording. You can still transcribe it or record again.');}}}/><Button title="Stop playback" variant="ghost" onPress={()=>preview.current?.pause()}/><Button title="Transcribe recording" onPress={transcribe}/></>}
  {phase!=='idle' && <Button title="Cancel recording" onPress={cancel} variant="ghost"/>}
 </View>;
}
