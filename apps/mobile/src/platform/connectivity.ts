import {Platform} from 'react-native';

export interface ConnectionState {online:boolean|null}
/** Browser online events or native OS network events. Unknown reachability is never asserted offline. */
export function watchConnectivity(listener:(state:ConnectionState)=>void):()=>void {
 if(Platform.OS==='web'){
  if(typeof window==='undefined')return()=>{};
  const update=()=>listener({online:navigator.onLine});update();
  window.addEventListener('online',update);window.addEventListener('offline',update);
  return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update);};
 }
 const network=require('expo-network') as typeof import('expo-network');
 let active=true;
 const update=(value:import('expo-network').NetworkState)=>{if(active)listener({online:value.isConnected===false?false:(value.isInternetReachable??value.isConnected??null)});};
 const subscription=network.addNetworkStateListener(update);
 void network.getNetworkStateAsync().then(update).catch(()=>undefined);
 return()=>{active=false;subscription.remove();};
}
