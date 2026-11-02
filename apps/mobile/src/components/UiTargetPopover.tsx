import React,{useState} from 'react';
import {View} from 'react-native';
import type {UiSegment} from '@mergemate/contracts';
import * as Clipboard from 'expo-clipboard';
import {triggerDeviceHaptic} from '../platform/android';
import {useTheme} from '../context/ThemeContext';
import {Button} from './Button';
import {Text} from './Text';
export const HIG_TARGET_FIX='style={{ minHeight: 44, minWidth: 44 }}';
export function UiTargetPopover({segment,onClose}:{segment:UiSegment;onClose:()=>void}){
 const {colors}=useTheme(),[note,setNote]=useState('');
 return <View testID="ui-target-popover" style={{padding:16,borderRadius:16,borderWidth:1,borderColor:segment.touchTargetCompliant?colors.riskLow:colors.riskHigh,backgroundColor:colors.surfaceElevated,gap:10}}>
  <Text accessibilityRole="header" style={{color:colors.text,fontWeight:'700'}}>{segment.label}: {segment.touchTargetSizePt.width}pt x {segment.touchTargetSizePt.height}pt</Text>
  <Text style={{color:segment.touchTargetCompliant?colors.riskLow:colors.riskHigh}}>{segment.touchTargetCompliant?'Estimated target meets the 44pt minimum. Verify the actual hit area.':'Apple HIG Warning: minimum touch target is 44pt x 44pt. Screenshot metrics are estimates; verify the actual hit area.'}</Text>
  <Button title="Copy Fix" onPress={async()=>{try{if(!await Clipboard.setStringAsync(HIG_TARGET_FIX))throw new Error('Clipboard unavailable');triggerDeviceHaptic();setNote('Fix copied to clipboard. Review and apply it yourself; no source code changed.');}catch{setNote('Could not copy the fix. Try again.');}}}/>
  <Button title="Dismiss Target" variant="ghost" onPress={onClose}/>
  {!!note&&<Text accessibilityLiveRegion="polite" style={{color:colors.textSecondary}}>{note}</Text>}
 </View>;
}
