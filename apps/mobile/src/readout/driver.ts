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
  if(Platform.OS==='android'){
    const local=requireOptionalNativeModule<AndroidVoice>('MergeMateOfflineVoice');let voice:LocalVoice|undefined;let counter=0;
    return {
      async available(){try{voice=(await local?.getLocalVoicesAsync())?.[0];return !!voice;}catch{return false;}},
      speak(text,rate,done,error){if(!local || !voice){error();return;}local.speakAsync(text,voice.identifier,rate,`utterance-${++counter}`).then(done,error);},
      async stop(){await local?.stopAsync();},
    };
  }
  let voice:Speech.Voice|undefined;
  return {
    async available(){try{voice=(await Speech.getAvailableVoicesAsync())[0];return !!voice;}catch{return false;}},
    speak(text,rate,done,error){if(!voice){error();return;}Speech.speak(text,{voice:voice.identifier,rate,onDone:done,onError:error});},
    stop:()=>Speech.stop(),pause:()=>Speech.pause(),resume:()=>Speech.resume(),
  };
}
