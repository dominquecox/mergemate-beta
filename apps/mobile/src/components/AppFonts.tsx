import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useFonts } from 'expo-font';
import { Ionicons } from '@expo/vector-icons';

/** All typefaces are bundled locally, with no external font or CDN requests. */
export function AppFonts({children}:{children:React.ReactNode}) {
  const [ready,error]=useFonts({
    ...Ionicons.font,
    Geist_400Regular:require('@expo-google-fonts/geist/400Regular/Geist_400Regular.ttf'),
    Geist_500Medium:require('@expo-google-fonts/geist/500Medium/Geist_500Medium.ttf'),
    Geist_600SemiBold:require('@expo-google-fonts/geist/600SemiBold/Geist_600SemiBold.ttf'),
    Geist_700Bold:require('@expo-google-fonts/geist/700Bold/Geist_700Bold.ttf'),
    JetBrainsMono_400Regular:require('@expo-google-fonts/jetbrains-mono/400Regular/JetBrainsMono_400Regular.ttf'),
  });
  if(!ready && !error)return <View style={{flex:1,alignItems:'center',justifyContent:'center'}}><ActivityIndicator accessibilityLabel="Loading interface fonts" /></View>;
  return <>{children}</>;
}
