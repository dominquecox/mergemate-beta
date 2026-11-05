export const VOICE_SECONDS=120;
export const VOICE_RATE=16000;
export const EMPTY_RECORDING='The recording is empty. Check your microphone and record again.';
/** About -54 dBFS: anything quieter across the whole take is treated as no input. */
const EMPTY_PEAK=64;
/** Bounded, mono PCM buffer. Paused samples never enter the recording. */
export class PcmRecording {
 private chunks:Int16Array[]=[];
 private count=0;
 private peak=0;
 paused=false;
 get seconds(){return this.count/VOICE_RATE;}
 add(samples:Float32Array,rate:number,channels:number):boolean{
  if(this.paused)return false;
  if(!Number.isFinite(rate)||rate<8000||rate>192000||!Number.isInteger(channels)||channels<1||channels>8)throw new Error('Unsupported microphone format.');
  const frames=Math.floor(samples.length/channels);
  const length=Math.min(Math.floor(frames*VOICE_RATE/rate),VOICE_RATE*VOICE_SECONDS-this.count);
  const out=new Int16Array(length);
  for(let i=0;i<length;i++){
   const frame=Math.min(frames-1,Math.floor(i*rate/VOICE_RATE));let mono=0;
   for(let channel=0;channel<channels;channel++)mono+=(samples[frame*channels+channel]??0)/channels;
   out[i]=Math.round(Math.max(-1,Math.min(1,Number.isFinite(mono)?mono:0))*32767);
   const level=Math.abs(out[i]!);if(level>this.peak)this.peak=level;
  }
  this.chunks.push(out);this.count+=length;
  return this.count>=VOICE_RATE*VOICE_SECONDS;
 }
 wav():Uint8Array{
  if(this.count<VOICE_RATE/10)throw new Error('Record at least a moment of speech, then try again.');
  // A silent capture (muted or blocked microphone) would play back as nothing at all; say so instead.
  if(this.peak<EMPTY_PEAK)throw new Error(EMPTY_RECORDING);
  const bytes=new Uint8Array(44+this.count*2),view=new DataView(bytes.buffer);
  for(const [offset,text] of [[0,'RIFF'],[8,'WAVE'],[12,'fmt '],[36,'data']] as const)for(let i=0;i<text.length;i++)bytes[offset+i]=text.charCodeAt(i);
  view.setUint32(4,bytes.length-8,true);view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,VOICE_RATE,true);view.setUint32(28,VOICE_RATE*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);view.setUint32(40,this.count*2,true);
  let offset=44;for(const chunk of this.chunks)for(const sample of chunk){view.setInt16(offset,sample,true);offset+=2;}
  return bytes;
 }
 clear(){for(const chunk of this.chunks)chunk.fill(0);this.chunks=[];this.count=0;this.peak=0;}
}
export interface VoiceCapture {pause():void;resume():void;stop():Promise<Uint8Array>;dispose():Promise<void>}
/** Playback state for the player row: seconds, and whether audio is playing. */
export interface VoiceStatus {position:number;duration:number;playing:boolean;error?:string}
export interface VoicePreview {play():Promise<void>;pause():void;seek(seconds:number):void;status():VoiceStatus;onStatus(listener:(status:VoiceStatus)=>void):()=>void;dispose():Promise<void>}
