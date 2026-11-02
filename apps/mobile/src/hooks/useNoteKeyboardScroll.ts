import {useCallback,useEffect,useRef,type RefObject,type ComponentRef} from 'react';
import {Keyboard,ScrollView} from 'react-native';

/** The notes composer ends the PR scroll view; reveal input and actions after keyboard resize. */
export function useNoteKeyboardScroll(scroll:RefObject<ComponentRef<typeof ScrollView>|null>,active:boolean){
 const focused=useRef(false);
 const reveal=useCallback(()=>{requestAnimationFrame(()=>scroll.current?.scrollToEnd({animated:true}));},[scroll]);
 const onFocus=useCallback(()=>{focused.current=true;reveal();},[reveal]);
 const onContentSizeChange=useCallback(()=>{if(focused.current)reveal();},[reveal]);
 const onBlur=useCallback(()=>{focused.current=false;},[]);
 useEffect(()=>{
  if(!active){focused.current=false;return;}
  const keyboard=Keyboard.addListener('keyboardDidShow',()=>{if(focused.current)reveal();});
  return()=>keyboard.remove();
 },[active,reveal]);
 return {onFocus,onBlur,onContentSizeChange};
}
