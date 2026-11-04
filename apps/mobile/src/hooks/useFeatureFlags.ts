import {useCallback,useState} from 'react';
import {useFocusEffect} from 'expo-router';
import {api} from '../api';
import {disabledFeatureFlags} from '../api/feature-flags';
export function useFeatureFlags(){
  const [flags,setFlags]=useState(disabledFeatureFlags);
  useFocusEffect(useCallback(()=>{
    let active=true;
    api.getFeatureFlags().then(value=>{if(active)setFlags(value);},()=>{if(active)setFlags(disabledFeatureFlags());});
    return()=>{active=false;};
  },[]));
  return flags;
}
