import React,{useState} from 'react';
import {View} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import {executiveBrief,type ExecutiveBriefEntry} from '../workspace/executiveExport';
import {triggerDeviceHaptic} from '../platform/android';
import {useTheme} from '../context/ThemeContext';
import {Button} from './Button';
import {Text} from './Text';
export function ExecutiveBriefExport({entries,elapsed}:{entries:ExecutiveBriefEntry[];elapsed:number}){
 const {colors}=useTheme(),[note,setNote]=useState('');
 return <View style={{marginTop:16,gap:8}}><Button title="Export Morning Executive Brief" disabled={!entries.length} onPress={async()=>{try{if(!await Clipboard.setStringAsync(executiveBrief(entries,elapsed)))throw new Error('Clipboard unavailable');triggerDeviceHaptic();setNote('Copied to Clipboard');}catch{setNote('Could not copy the brief. Try again.');}}}/>{!!note&&<Text accessibilityLiveRegion="polite" style={{color:colors.textSecondary}}>{note}</Text>}</View>;
}
