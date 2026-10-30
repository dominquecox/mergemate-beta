import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useFonts } from 'expo-font';

/** All typefaces are bundled locally, with no external font or CDN requests. Files live in assets/fonts, not node_modules: the exported URL of an `@scoped` package path is redirected by the static host and loops, so the fonts never load. */
export function AppFonts({children}:{children:React.ReactNode}) {
  const [ready,error]=useFonts({
    ionicons:require('../../assets/fonts/Ionicons.ttf'),
    Geist_400Regular:require('../../assets/fonts/Geist_400Regular.ttf'),
    Geist_500Medium:require('../../assets/fonts/Geist_500Medium.ttf'),
    Geist_600SemiBold:require('../../assets/fonts/Geist_600SemiBold.ttf'),
    Geist_700Bold:require('../../assets/fonts/Geist_700Bold.ttf'),
    JetBrainsMono_400Regular:require('../../assets/fonts/JetBrainsMono_400Regular.ttf'),
  });

  if(!ready && !error)return <View style={{flex:1,alignItems:'center',justifyContent:'center'}}><ActivityIndicator accessibilityLabel="Loading interface fonts" /></View>;
  return <>{children}</>;
}
