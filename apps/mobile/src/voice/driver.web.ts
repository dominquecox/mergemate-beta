import {PcmRecording,VOICE_RATE,type VoiceCapture,type VoicePreview,type VoiceStatus} from './pcm';
/** Web Audio captures PCM directly; no compressed signature is passed off as validated audio. */
export async function startVoiceCapture(onLimit:()=>void,onProgress?:(seconds:number)=>void,signal?:AbortSignal):Promise<VoiceCapture>{
 if(!navigator.mediaDevices?.getUserMedia || !globalThis.AudioContext)throw new Error('Recording is unavailable in this browser. Type a private note instead.');
 const stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true},video:false});
 if(signal?.aborted){for(const track of stream.getTracks())track.stop();throw new Error("Recording cancelled.");}
 let context:AudioContext|undefined;
 try{
  context=new AudioContext();await context.resume();
  if(signal?.aborted)throw new Error("Recording cancelled.");
  const source=context.createMediaStreamSource(stream),processor=context.createScriptProcessor(4096,1,1),recording=new PcmRecording();
  let closed=false,limited=false;
  processor.onaudioprocess=event=>{
   if(closed || limited)return;
   const full=recording.add(event.inputBuffer.getChannelData(0),event.inputBuffer.sampleRate,1);onProgress?.(recording.seconds);if(full){limited=true;onLimit();}
  };
  source.connect(processor);processor.connect(context.destination);
  const close=async()=>{if(closed)return;closed=true;processor.onaudioprocess=null;let failed=false;for(const cleanup of [()=>processor.disconnect(),()=>source.disconnect(),...stream.getTracks().map(track=>()=>track.stop())])try{cleanup();}catch{failed=true;}try{await context?.close();}catch{failed=true;}if(failed)throw new Error('Audio cleanup failed. Close this tab before recording again.');};
  return {pause(){recording.paused=true;},resume(){recording.paused=false;},async stop(){await close();try{return recording.wav();}finally{recording.clear();}},async dispose(){await close();recording.clear();}};
 }catch(error){for(const track of stream.getTracks())track.stop();await context?.close().catch(()=>{});throw error;}
}
export async function createVoicePreview(bytes:Uint8Array):Promise<VoicePreview>{
 const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:'audio/wav'}));const audio=new Audio();
 audio.preload='auto';audio.src=url;
 // The WAV length is known exactly; it shows before metadata loads and covers browsers that report Infinity.
 const exact=Math.max(0,(bytes.length-44)/(VOICE_RATE*2));
 const listeners=new Set<(status:VoiceStatus)=>void>();let error:string|undefined;
 const status=():VoiceStatus=>({position:Number.isFinite(audio.currentTime)?audio.currentTime:0,duration:Number.isFinite(audio.duration)&&audio.duration>0?audio.duration:exact,playing:!audio.paused&&!audio.ended,...(error?{error}:{})});
 const emit=()=>{const value=status();for(const listener of listeners)listener(value);};
 const onError=()=>{error='This recording could not be played in this browser. You can still transcribe it or record again.';emit();};
 const events=['loadedmetadata','durationchange','timeupdate','play','pause','ended'] as const;
 for(const name of events)audio.addEventListener(name,emit);audio.addEventListener('error',onError);
 return {
  async play(){if(audio.ended)audio.currentTime=0;await audio.play();},
  pause(){audio.pause();},
  seek(seconds){audio.currentTime=Math.max(0,Math.min(seconds,status().duration));emit();},
  status,
  onStatus(listener){listeners.add(listener);return()=>{listeners.delete(listener);};},
  async dispose(){listeners.clear();for(const name of events)audio.removeEventListener(name,emit);audio.removeEventListener('error',onError);audio.pause();audio.removeAttribute('src');audio.load();URL.revokeObjectURL(url);},
 };
}
