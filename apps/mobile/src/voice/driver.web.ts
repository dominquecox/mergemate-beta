import {PcmRecording,type VoiceCapture,type VoicePreview} from './pcm';
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
  const close=async()=>{if(closed)return;closed=true;processor.onaudioprocess=null;processor.disconnect();source.disconnect();for(const track of stream.getTracks())track.stop();await context?.close();};
  return {pause(){recording.paused=true;},resume(){recording.paused=false;},async stop(){await close();try{return recording.wav();}finally{recording.clear();}},async dispose(){await close();recording.clear();}};
 }catch(error){for(const track of stream.getTracks())track.stop();await context?.close().catch(()=>{});throw error;}
}
export async function createVoicePreview(bytes:Uint8Array):Promise<VoicePreview>{
 const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:'audio/wav'}));const audio=new Audio(url);
 return {async play(){audio.currentTime=0;await audio.play();},pause(){audio.pause();},async dispose(){audio.pause();audio.removeAttribute('src');audio.load();URL.revokeObjectURL(url);}};
}
