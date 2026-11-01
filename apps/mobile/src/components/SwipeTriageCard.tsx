import React,{useEffect,useRef,useState} from 'react';
import {AccessibilityInfo,Animated,PanResponder,Platform,StyleSheet,View,useWindowDimensions,type ViewProps,type ViewStyle} from 'react-native';
import type {TriageLane} from '../types';
import {swipeLane} from '../triage/gesture';
import {useTheme} from '../context/ThemeContext';
import {Text} from './Text';

export function SwipeTriageCard({children,disabled,onDecision,onInteraction}:{children:React.ReactNode;disabled:boolean;onDecision:(lane:TriageLane)=>Promise<boolean>;onInteraction:(busy:boolean)=>void}){
 const {colors}=useTheme(),{width,height}=useWindowDimensions(),[stamp,setStamp]=useState<TriageLane|null>(null);
 const position=useRef(new Animated.ValueXY()).current,busy=useRef(false),mounted=useRef(true),reduced=useRef(false);
 const pointer=useRef<{x:number;y:number;id:number}|null>(null);
 const latest=useRef({disabled,onDecision,onInteraction,width,height});latest.current={disabled,onDecision,onInteraction,width,height};
 useEffect(()=>{mounted.current=true;void AccessibilityInfo.isReduceMotionEnabled().then(value=>{reduced.current=value;});const sub=AccessibilityInfo.addEventListener('reduceMotionChanged',value=>{reduced.current=value;});return()=>{mounted.current=false;sub.remove();position.stopAnimation();latest.current.onInteraction(false);};},[position]);
 const reset=()=>{if(!mounted.current)return;setStamp(null);if(reduced.current)position.setValue({x:0,y:0});else Animated.spring(position,{toValue:{x:0,y:0},useNativeDriver:Platform.OS!=='web',speed:20,bounciness:5}).start();busy.current=false;latest.current.onInteraction(false);};
 const begin=()=>{busy.current=true;latest.current.onInteraction(true);position.stopAnimation();};
 const move=(dx:number,dy:number)=>{position.setValue({x:dx,y:Math.min(40,dy)});setStamp(swipeLane(dx,dy));};
 const release=(dx:number,dy:number)=>{
  const lane=swipeLane(dx,dy,true);if(!lane){reset();return;}
  const target=lane==='fyi'?{x:0,y:-latest.current.height}:{x:(lane==='ignore'?-1:1)*(latest.current.width+120),y:dy};
  Animated.timing(position,{toValue:target,duration:reduced.current?0:180,useNativeDriver:Platform.OS!=='web'}).start(({finished})=>{
   if(!finished||!mounted.current){reset();return;}
   void latest.current.onDecision(lane).finally(reset);
  });
 };
 const actions=useRef({begin,move,release,reset});actions.current={begin,move,release,reset};
 const responder=useRef(PanResponder.create({
  onMoveShouldSetPanResponder:(_event,g)=>!latest.current.disabled&&!busy.current&&(Math.abs(g.dx)>12||g.dy < -12),
  onPanResponderGrant:()=>actions.current.begin(),
  onPanResponderMove:(_event,g)=>actions.current.move(g.dx,g.dy),
  onPanResponderRelease:(_event,g)=>actions.current.release(g.dx,g.dy),
  onPanResponderTerminate:()=>actions.current.reset(),
  onPanResponderTerminationRequest:()=>!busy.current,
 })).current;
 // Pointer capture keeps web release events attached while the animated card leaves the pointer.
 const webHandlers={
  onPointerDown:(e:React.PointerEvent<HTMLElement>)=>{if(latest.current.disabled||busy.current||e.button!==0)return;pointer.current={x:e.pageX,y:e.pageY,id:e.pointerId};},
  onPointerMove:(e:React.PointerEvent<HTMLElement>)=>{const p=pointer.current;if(!p||p.id!==e.pointerId)return;const dx=e.pageX-p.x,dy=e.pageY-p.y;if(!busy.current&&(Math.abs(dx)>12||dy < -12)){begin();e.currentTarget.setPointerCapture(e.pointerId);}if(busy.current){e.preventDefault();move(dx,dy);}},
  onPointerUp:(e:React.PointerEvent<HTMLElement>)=>{const p=pointer.current;if(!p||p.id!==e.pointerId)return;pointer.current=null;if(busy.current){e.preventDefault();release(e.pageX-p.x,e.pageY-p.y);}},
  onPointerCancel:()=>{pointer.current=null;reset();},
 } as unknown as ViewProps;
 const tone=stamp==='ignore'?colors.riskHigh:stamp==='fyi'?colors.riskMedium:colors.brandLight;
 return <Animated.View testID="swipe-triage-card" {...(Platform.OS==='web'?webHandlers:responder.panHandlers)} style={[Platform.OS==='web'?{touchAction:'none',userSelect:'none'} as ViewStyle:undefined,{transform:[{translateX:position.x},{translateY:position.y},{rotate:position.x.interpolate({inputRange:[-240,0,240],outputRange:['-12deg','0deg','12deg'],extrapolate:'clamp'})},{scale:position.y.interpolate({inputRange:[-240,0],outputRange:[0.94,1],extrapolate:'clamp'})}]}]}>
  {children}
  {stamp&&<View pointerEvents="none" style={[styles.stamp,{borderColor:tone,backgroundColor:colors.surface}]}><Text accessibilityLiveRegion="polite" style={{color:tone,fontWeight:'800',fontSize:22}}>{stamp==='ignore'?'IGNORE':stamp==='fyi'?'FYI':'NEEDS YOU'}</Text></View>}
 </Animated.View>;
}
const styles=StyleSheet.create({stamp:{position:'absolute',top:20,left:20,borderWidth:3,borderRadius:8,padding:12,transform:[{rotate:'-8deg'}]}});
