import {AudioModule,requestRecordingPermissionsAsync,setAudioModeAsync,createAudioPlayer} from 'expo-audio';
import {File,Directory,Paths} from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import {PcmRecording,type VoiceCapture,type VoicePreview} from './pcm';
let oldFilesCleared=false;
let captureLease=Promise.resolve();
function clearAbandonedPreviewFiles(){if(oldFilesCleared)return;for(const item of new Directory(Paths.cache).list())if(item instanceof File && /^voice-[0-9a-f-]+\.wav$/.test(item.name))item.delete();oldFilesCleared=true;}
/** SDK58 PCM stream; no audio is written to disk while recording. */
export async function startVoiceCapture(onLimit:()=>void,onProgress?:(seconds:number)=>void,signal?:AbortSignal):Promise<VoiceCapture>{
 // A cancelled permission prompt cannot reset the audio mode of a newer capture.
 const previous=captureLease;let unlock:()=>void=()=>{};captureLease=new Promise<void>(resolve=>{unlock=resolve;});await previous;
 try{
  if(signal?.aborted)throw new Error('Recording cancelled.');
  clearAbandonedPreviewFiles();
  const permission=await requestRecordingPermissionsAsync();
  if(signal?.aborted)throw new Error('Recording cancelled.');
  if(!permission.granted)throw new Error('Microphone access is off. Enable it in device settings or type a private note.');
  const recording=new PcmRecording();
  const stream=new AudioModule.AudioStream({sampleRate:16000,channels:1,encoding:'float32'});
  let closed=false,limited=false,invalid=false;
  const subscription=stream.addListener('audioStreamBuffer',buffer=>{
   if(closed||limited)return;
   try{const full=recording.add(new Float32Array(buffer.data),buffer.sampleRate,buffer.channels);onProgress?.(recording.seconds);if(full){limited=true;onLimit();}}
   catch{invalid=true;limited=true;onLimit();}
  });
  const close=async()=>{if(closed)return;closed=true;try{subscription.remove();stream.stop();stream.release();await setAudioModeAsync({allowsRecording:false,shouldPlayInBackground:false});}finally{unlock();}};
  try{await setAudioModeAsync({allowsRecording:true,playsInSilentMode:true,shouldPlayInBackground:false,allowsBackgroundRecording:false});if(signal?.aborted)throw new Error('Recording cancelled.');await stream.start();if(signal?.aborted)throw new Error('Recording cancelled.');}
  catch(error){await close();throw error;}
  return {pause(){recording.paused=true;},resume(){recording.paused=false;},async stop(){await close();try{if(invalid)throw new Error('Unsupported microphone format.');return recording.wav();}finally{recording.clear();}},async dispose(){try{await close();}finally{recording.clear();}}};
 }catch(error){unlock();throw error;}
}
export async function createVoicePreview(bytes:Uint8Array):Promise<VoicePreview>{
 const file=new File(Paths.cache,`voice-${Crypto.randomUUID()}.wav`);
 try{
  file.create();file.write(bytes);
  const player=createAudioPlayer(file.uri);
  return {async play(){await player.seekTo(0);player.play();},pause(){player.pause();},async dispose(){try{player.remove();}finally{if(file.exists)file.delete();}}};
 }catch(error){if(file.exists)file.delete();throw error;}
}
