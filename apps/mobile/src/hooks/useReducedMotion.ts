import {useEffect,useState} from 'react';
import {AccessibilityInfo,Platform} from 'react-native';
export function useReducedMotion(){
  const [reduced,setReduced]=useState(true);
  useEffect(()=>{
    if(Platform.OS==='web' && typeof matchMedia==='function'){
      const media=matchMedia('(prefers-reduced-motion: reduce)');const update=()=>setReduced(media.matches);update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update);
    }
    let active=true;AccessibilityInfo.isReduceMotionEnabled().then(value=>{if(active)setReduced(value);}).catch(()=>undefined);
    const listener=AccessibilityInfo.addEventListener('reduceMotionChanged',setReduced);
    return()=>{active=false;listener.remove();};
  },[]);
  return reduced;
}
