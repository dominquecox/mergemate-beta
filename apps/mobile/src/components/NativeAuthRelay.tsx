import React,{useEffect} from 'react';
import {View} from 'react-native';
import {Button} from './Button';
import {Text} from './Text';
import {useTheme} from '../context/ThemeContext';

/** Browser-to-app transport of a PKCE code only. The verifier remains in device SecureStore. */
export function NativeAuthRelay({url}:{url:string}){
 const {colors}=useTheme();
 const open=()=>window.location.assign(url);
 useEffect(()=>{open();},[url]);
 return <View style={{padding:24,gap:16,maxWidth:440}}>
  <Text accessibilityRole="header" style={{fontSize:22,fontWeight:'700',color:colors.text}}>Return to MergeMate</Text>
  <Text style={{color:colors.textSecondary}}>Finish GitHub sign-in in the installed MergeMate app. If it did not open automatically, tap below.</Text>
  <Button title="Open MergeMate" onPress={open}/>
 </View>;
}
