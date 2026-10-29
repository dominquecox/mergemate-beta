import {AudioModule,requestRecordingPermissionsAsync,setAudioModeAsync,createAudioPlayer} from 'expo-audio';
import {File,Directory,Paths} from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import {PcmRecording,type VoiceCapture,type VoicePreview} from './pcm';
let oldFilesCleared=false;
function clearAbandonedPreviewFiles(){if(oldFilesCleared)return;for(const item of new Directory(Paths.cache).list())if(item instanceof File && /^voice-[0-9a-f-]+\.wav$/.test(item.name))item.delete();oldFilesCleared=true;}
/** SDK58 PCM stream; no audio is written to disk while recording. */
export async function startVoiceCapture(onLimit:()=>void,onProgress?:(seconds:number)=>void):Promise<VoiceCapture>{
 clearAbandonedPreviewFiles();
 const permission=await requestRecordingPermissionsAsync();
 if(!permission.granted)throw new Error('Microphone access is off. Enable it in device settings or type a private note.');
 const recording=new PcmRecording();
 const stream=new AudioModule.AudioStream({sampleRate:16000,channels:1,encoding:'float32'});
 let closed=false,limited=false;
 const subscription=stream.addListener('audioStreamBuffer',buffer=>{if(closed||limited)return;const full=recording.add(new Float32Array(buffer.data),buffer.sampleRate,buffer.channels);onProgress?.(recording.seconds);if(full){limited=true;onLimit();}});
 const close=async()=>{if(closed)return;closed=true;subscription.remove();stream.stop();stream.release();await setAudioModeAsync({allowsRecording:false});};
 try{await setAudioModeAsync({allowsRecording:true,playsInSilentMode:true});await stream.start();}
 catch(error){await close();throw error;}
 return {pause(){recording.paused=true;},resume(){recording.paused=false;},async stop(){await close();try{return recording.wav();}finally{recording.clear();}},async dispose(){await close();recording.clear();}};
}
export async function createVoicePreview(bytes:Uint8Array):Promise<VoicePreview>{
 const file=new File(Paths.cache,`voice-${Crypto.randomUUID()}.wav`);
 try{
  file.create();file.write(bytes);
  const player=createAudioPlayer(file.uri);
  return {async play(){await player.seekTo(0);player.play();},pause(){player.pause();},async dispose(){try{player.remove();}finally{if(file.exists)file.delete();}}};
 }catch(error){if(file.exists)file.delete();throw error;}
}
