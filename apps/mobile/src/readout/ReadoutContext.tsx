import React,{createContext,useContext,useEffect,useMemo,useState} from 'react';
import {AppState,Platform} from 'react-native';
import {api} from '../api';
import {useAuth} from '../context/AuthContext';
import {ReadoutController} from './controller';
import {deviceSpeechDriver} from './driver';
import {registerReadoutStop} from './active';
const Context=createContext<{enabled:boolean;controller:ReadoutController}|null>(null);
export function ReadoutProvider({children}:{children:React.ReactNode}){
  const {user}=useAuth();const [enabled,setEnabled]=useState(false);
  const controller=useMemo(()=>new ReadoutController(deviceSpeechDriver()),[]);
  useEffect(()=>registerReadoutStop(()=>{void controller.stop();}),[controller]);
  useEffect(()=>{
    let active=true;let refreshInFlight=false;let lastAttempt=0;let deferred:ReturnType<typeof setTimeout>|undefined;
    setEnabled(false);void controller.stop();
    const stop=()=>{setEnabled(false);void controller.stop();};
    const foreground=()=>AppState.currentState==='active' && (Platform.OS!=='web' || typeof document==='undefined' || document.visibilityState==='visible');
    const refresh=async()=>{
      if(!active || !user || !foreground() || refreshInFlight)return;
      const remaining=5000-(Date.now()-lastAttempt);if(remaining>0){if(deferred===undefined)deferred=setTimeout(()=>{deferred=undefined;void refresh();},remaining);return;}
      refreshInFlight=true;lastAttempt=Date.now();stop();
      try{const flags=await api.getFeatureFlags(true);if(active && foreground())setEnabled(flags.voice_readout===true);}catch{if(active)stop();}
      finally{refreshInFlight=false;}
    };
    void refresh();
    const timer=setInterval(()=>{void refresh();},60_000);
    const listener=AppState.addEventListener('change',state=>{if(state==='active')void refresh();else stop();});
    const visibility=()=>{if(document.visibilityState==='visible')void refresh();else stop();};
    const pagehide=()=>stop();
    if(Platform.OS==='web' && typeof document!=='undefined'){document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',pagehide);}
    return()=>{active=false;clearInterval(timer);if(deferred!==undefined)clearTimeout(deferred);listener.remove();void controller.stop();if(Platform.OS==='web' && typeof document!=='undefined'){document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',pagehide);}};
  },[user?.id,controller]);
  return <Context.Provider value={{enabled,controller}}>{children}</Context.Provider>;
}
export function useReadout(){const value=useContext(Context);if(!value)throw new Error('Readout provider missing');return value;}
