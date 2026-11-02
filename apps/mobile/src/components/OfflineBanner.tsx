import React,{useEffect,useState} from 'react';
import {Platform,View} from 'react-native';
import {Text} from './Text';
import {useTheme} from '../context/ThemeContext';
export function OfflineBanner(){
 const {colors}=useTheme();const [offline,setOffline]=useState(false);
 useEffect(()=>{
  if(Platform.OS!=='web'||typeof window==='undefined')return;
  const update=()=>setOffline(navigator.onLine===false);update();
  window.addEventListener('online',update);window.addEventListener('offline',update);
  return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update);};
 },[]);
 return offline?<View accessibilityRole="alert" style={{padding:12,backgroundColor:colors.surface}}><Text style={{color:colors.text}}>Offline. Reconnecting automatically; unsent changes are not queued.</Text></View>:null;
}
