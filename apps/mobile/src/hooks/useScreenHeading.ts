import {useCallback,useEffect,useRef,type ComponentRef} from 'react';
import {Platform} from 'react-native';
import {useFocusEffect,useNavigation,usePathname} from 'expo-router';
import type {Text} from '../components/Text';
import {focusVisibleHeading,releaseWebFocus} from '../navigation/heading-focus';
/** Route changes only: do not steal focus on data loads or ordinary control updates. */
export function useScreenHeading(){
  const pathname=usePathname();
  const navigation=useNavigation();
  const heading=useRef<ComponentRef<typeof Text>>(null);
  useEffect(()=>navigation.addListener('blur',()=>{if(Platform.OS==='web')releaseWebFocus();}),[navigation]);
  useFocusEffect(useCallback(()=>{
    if(Platform.OS!=='web')return;
    let frame:number;
    let attempts=0;
    const focus=()=>{if(!focusVisibleHeading(heading.current) && ++attempts<10)frame=requestAnimationFrame(focus);};
    frame=requestAnimationFrame(focus);
    return()=>cancelAnimationFrame(frame);
  },[pathname]));
  return heading;
}
