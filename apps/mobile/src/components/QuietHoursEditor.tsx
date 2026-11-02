import React, {useEffect,useState} from 'react';
import {View,TextInput} from 'react-native';
import {QuietHours, type Settings} from '@mergemate/contracts';
import {Text} from './Text';
import {Button} from './Button';
import {useTheme} from '../context/ThemeContext';

export function QuietHoursEditor({value,disabled,onSave}:{value:Settings['quietHours'];disabled:boolean;onSave:(value:QuietHours)=>Promise<boolean>}) {
 const {colors}=useTheme();
 const [start,setStart]=useState(value?.start??'22:00'),[end,setEnd]=useState(value?.end??'07:00');
 const [zone,setZone]=useState(value?.timeZone??Intl.DateTimeFormat().resolvedOptions().timeZone??'UTC');
 const [error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false);
 useEffect(()=>{if(value){setStart(value.start);setEnd(value.end);setZone(value.timeZone);}},[value]);
 if(!value)return null;
 const save=async()=>{
  const parsed=QuietHours.safeParse({start,end,timeZone:zone.trim()});
  if(!parsed.success){setError('Use different HH:MM times and a valid IANA time zone.');return;}
  setBusy(true);setError(null);
  try{if(!await onSave(parsed.data))setError('Schedule could not be saved. Try again.');}catch{setError('Schedule could not be saved. Try again.');}finally{setBusy(false);}
 };
 return <View style={{padding:16,gap:10}}>
  <Text style={{color:colors.textSecondary}}>Local clock times; overnight schedules and daylight saving are supported. Inbox items still arrive while alerts are quiet.</Text>
  {([{label:'Quiet hours start (HH:MM)',value:start,set:setStart},{label:'Quiet hours end (HH:MM)',value:end,set:setEnd},{label:'Quiet hours time zone',value:zone,set:setZone}]).map(field=><View key={field.label}><Text style={{color:colors.text}}>{field.label}</Text><TextInput accessibilityLabel={field.label} value={field.value} onChangeText={field.set} editable={!disabled&&!busy} autoCapitalize="none" autoCorrect={false} maxLength={100} style={{minHeight:44,minWidth:44,color:colors.text,borderColor:colors.border,borderWidth:1,padding:10}}/></View>)}
  {error&&<Text accessibilityRole="alert" style={{color:colors.text}}>{error}</Text>}
  <Button title={busy?'Saving schedule…':'Save quiet schedule'} disabled={disabled||busy} onPress={()=>void save()}/>
 </View>;
}
