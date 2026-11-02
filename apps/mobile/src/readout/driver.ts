import {Platform} from 'react-native';
import {requireOptionalNativeModule} from 'expo';
import * as Speech from 'expo-speech';
import type {SpeechDriver} from './controller';
interface LocalVoice {identifier:string;language:string}
interface AndroidVoice {
  getLocalVoicesAsync():Promise<LocalVoice[]>;
  speakAsync(text:string,voice:string,rate:number,id:string):Promise<void>;
  stopAsync():Promise<void>;
}
export function deviceSpeechDriver():SpeechDriver {
  if(Platform.OS==='web'){
    let voice:SpeechSynthesisVoice|undefined;
    const synthesis=typeof speechSynthesis==='undefined'?undefined:speechSynthesis;
    return {
      async available(){voice=synthesis?.getVoices().find(item=>item.localService);return !!voice;},
      speak(text,rate,done,error){if(!synthesis || !voice || !voice.localService){error();return;}const utterance=new SpeechSynthesisUtterance(text);utterance.voice=voice;utterance.rate=rate;utterance.onend=done;utterance.onerror=error;synthesis.speak(utterance);},
      async stop(){synthesis?.cancel();},async pause(){synthesis?.pause();},async resume(){synthesis?.resume();},
    };
  }
  const system=systemSpeechDriver(Platform.OS!=='android');
  if(Platform.OS==='android'){
    let local:AndroidVoice|null=null;
    try{local=requireOptionalNativeModule<AndroidVoice>('MergeMateOfflineVoice');}catch{/* Use the configured system engine when the optional adapter cannot load. */}
    let voice:LocalVoice|undefined;let counter=0;let selected:'local'|'system'|undefined;
    return {
      async available(){
        voice=undefined;
        try{voice=(await local?.getLocalVoicesAsync())?.[0];}catch{/* Offline voice probing may fail on AOSP devices. */}
        selected=voice?'local':'system';
        return !!voice || system.available();
      },
      speak(text,rate,done,error){
        if(local&&voice){local.speakAsync(text,voice.identifier,rate,`utterance-${++counter}`).then(done,error);return;}
        system.speak(text,rate,done,error);
      },
      async stop(){if(selected==='local'&&local)await local.stopAsync();else if(selected==='system')await system.stop();},
      // Android expo-speech cannot pause: the controller stops and replays the current sentence.
    };
  }
  return system;
}
function systemSpeechDriver(canPause:boolean):SpeechDriver {
  let voice:Speech.Voice|undefined;
  return {
    async available(){voice=undefined;try{voice=(await Speech.getAvailableVoicesAsync())[0];return !!voice;}catch{return false;}},
    speak(text,rate,done,error){if(!voice){error();return;}try{Speech.speak(text,{voice:voice.identifier,rate,onDone:done,onError:error});}catch{error();}},
    stop:()=>Speech.stop(),...(canPause?{pause:()=>Speech.pause(),resume:()=>Speech.resume()}:{}),
  };
}
