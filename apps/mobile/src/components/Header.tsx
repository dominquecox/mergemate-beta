import React from 'react';
import { View, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { Text } from './Text';
import { useRouter } from 'expo-router';
import {useScreenHeading} from '../hooks/useScreenHeading';
import { useTheme } from '../context/ThemeContext';
import { Icon } from './Icon';

interface HeaderProps {
  title?: string;
  onBack?:()=>void;
  showBack?: boolean;
  showLogo?: boolean;
  rightAction?: React.ReactNode;
  footer?: React.ReactNode;
}

/** One compact title/action row, with an optional pinned progress track. */
export function Header({title,onBack,showBack=false,showLogo=false,rightAction,footer}:HeaderProps) {
  const router=useRouter();
  const heading=useScreenHeading();
  const {colors,typography,isDark}=useTheme();
  return <View style={{backgroundColor:colors.background,borderBottomWidth:1,borderBottomColor:colors.border}}>
    <View style={styles.row}>
      {showBack && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go back" onPress={onBack??(()=>router.back())} style={styles.back}><Icon name="chevron-back" size={22} color={colors.textSecondary}/></TouchableOpacity>}
      {showLogo ? <Image source={isDark?require('../../assets/logo-dark.png'):require('../../assets/logo-light.png')} style={{width:142,height:34}} resizeMode="contain" accessibilityLabel="MergeMate"/> : <Text ref={heading} accessibilityRole="header" numberOfLines={2} style={[typography.headline,{color:colors.text,flex:1}]}>{title}</Text>}
      {!!rightAction && <View style={styles.actions}>{rightAction}</View>}
    </View>
    {footer}
  </View>;
}
const styles=StyleSheet.create({row:{minHeight:56,paddingHorizontal:16,flexDirection:'row',alignItems:'center',gap:8},back:{width:44,minHeight:44,marginLeft:-12,alignItems:'center',justifyContent:'center'},actions:{flexShrink:0,alignItems:'flex-end',justifyContent:'center'}});
