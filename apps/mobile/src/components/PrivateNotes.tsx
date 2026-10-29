import React,{useEffect,useRef,useState} from 'react';
import {TextInput,View} from 'react-native';
import * as Crypto from 'expo-crypto';
import {noteContextKey,type NoteContext,type PrivateNote} from '@mergemate/contracts';
import {api} from '../api';
import {useAuth} from '../context/AuthContext';
import {useConsent} from '../context/ConsentContext';
import {useFeatureFlags} from '../hooks/useFeatureFlags';
import {useTheme} from '../context/ThemeContext';
import {onSessionChange} from '../auth/session-events';
import {Button} from './Button';
import {Text} from './Text';
import {VoiceNoteRecorder} from './VoiceNoteRecorder';

export function PrivateNotes({context}:{context:NoteContext}){
 const {user,isDemo}=useAuth();
 if(!user || isDemo)return <Text>Private notes and recording are unavailable in demo mode.</Text>;
 return <NotesWorkspace key={`${user.id}:${noteContextKey(context)}`} context={context}/>;
}
function NotesWorkspace({context}:{context:NoteContext}){
 const {colors,typography}=useTheme(),flags=useFeatureFlags();const {aiConsentGranted}=useConsent();
 const [items,setItems]=useState<PrivateNote[]>([]),[text,setText]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[loaded,setLoaded]=useState(false),[active,setActive]=useState(true);
 const id=useRef(Crypto.randomUUID()),generation=useRef(0),lock=useRef(false);
 useEffect(()=>onSessionChange(()=>{generation.current++;setActive(false);setText('');setItems([]);}),[]);
 const load=async()=>{const version=generation.current;setLoading(true);setError(null);try{const notes=await api.getPrivateNotes(context);if(version===generation.current){setItems(notes);setLoaded(true);}}catch{if(version===generation.current)setError('Could not load private notes. Try again.');}finally{if(version===generation.current)setLoading(false);}};
 useEffect(()=>{void load();return()=>{generation.current++;};},[]);
 const save=async()=>{
  if(lock.current||!active||!text.trim())return;lock.current=true;setBusy(true);setError(null);const version=generation.current;
  try{const note=await api.savePrivateNote({id:id.current,context,text:text.trim()});if(version!==generation.current)return;setItems(old=>[...old.filter(item=>item.id!==note.id),note]);setText('');id.current=Crypto.randomUUID();}
  catch{if(version===generation.current)setError('Could not save this note. Your text is still here. Retry saving before editing it.');}
  finally{lock.current=false;if(version===generation.current)setBusy(false);}
 };
 const remove=async(note:PrivateNote)=>{if(lock.current)return;lock.current=true;setBusy(true);const version=generation.current;try{await api.removePrivateNote(note.id,context);if(version===generation.current)setItems(old=>old.filter(item=>item.id!==note.id));}catch{if(version===generation.current)setError('Could not remove this note. Try again.');}finally{lock.current=false;if(version===generation.current)setBusy(false);}};
 if(!active)return <Text>Account changed. Reopen this workspace to load its private notes.</Text>;
 return <View style={{gap:12,padding:16,borderWidth:1,borderColor:colors.border,borderRadius:12,marginVertical:16}}>
  <Text accessibilityRole="header" style={[typography.headline,{color:colors.text}]}>Private notes</Text>
  <Text style={[typography.body,{color:colors.textSecondary}]}>Only you can read these notes. They are never posted to GitHub.{context.kind==='highlight'?' Saved in your Highlight workspace; screenshots are not retained.':''}</Text>
  {loading && <Text accessibilityLiveRegion="polite">Loading private notes…</Text>}
  {error && <Text accessibilityRole="alert" style={{color:colors.riskHigh}}>{error}</Text>}
  {!loaded && !loading && <Button title="Retry loading notes" onPress={load}/>}
  {loaded && items.length===0 && <Text>No private notes saved here yet.</Text>}
  {items.map((note,index)=><View key={note.id} style={{gap:6,paddingVertical:8,borderBottomWidth:1,borderColor:colors.border}}><Text selectable style={[typography.body,{color:colors.text}]}>{note.text}</Text><Button title={`Remove note ${index+1}`} variant="ghost" disabled={busy} onPress={()=>remove(note)}/></View>)}
  {flags.voice_notes && aiConsentGranted && !busy && <VoiceNoteRecorder onTranscript={value=>{setText(value);id.current=Crypto.randomUUID();}}/>}
  <TextInput multiline value={text} onChangeText={setText} maxLength={8000} editable={!busy} accessibilityLabel="Private note text" placeholder="Write a note or review your transcript before saving…" placeholderTextColor={colors.textMuted} style={{minHeight:100,padding:12,color:colors.text,borderColor:colors.border,borderWidth:1,borderRadius:8}}/>
  <Button title="Save private note" onPress={save} loading={busy} disabled={!loaded||!text.trim()||items.length>=100}/>
  {!!text && <Button title="Discard draft note" variant="ghost" disabled={busy} onPress={()=>{setText('');id.current=Crypto.randomUUID();}}/>}
 </View>;
}
