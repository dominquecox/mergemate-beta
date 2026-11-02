import {watchConnectivity} from '../platform/connectivity';
import React,{useEffect,useState} from 'react';
import {View} from 'react-native';
import {Text} from './Text';
import {useTheme} from '../context/ThemeContext';
export function OfflineBanner(){
 const {colors}=useTheme();const [offline,setOffline]=useState(false);
 useEffect(()=>watchConnectivity(state=>setOffline(state.online===false)),[]);
 return offline?<View accessibilityRole="alert" style={{padding:12,backgroundColor:colors.surface}}><Text style={{color:colors.text}}>Offline. Reconnecting automatically; unsent changes are not queued.</Text></View>:null;
}
