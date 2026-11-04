import { Text } from "../src/components/Text";
import { Icon } from "../src/components/Icon";
import React, { useEffect, useState } from "react";
import { View, StyleSheet, Image, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../src/context/AuthContext";
import { useTheme } from "../src/context/ThemeContext";
import { LoadingState } from "../src/components/LoadingState";
import { ErrorState } from "../src/components/ErrorState";
import { EmptyState } from "../src/components/EmptyState";
import { StorageService } from "../src/storage";

export default function IndexScreen() {
  const router = useRouter();
  const { session, user, isDemo, isLoading, error, clearError } = useAuth();
  const { colors,typography,isDark } = useTheme();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    let current=true;
    if (!isLoading && !error) {
      if (session) {
        if(!user)return()=>{current=false;};
        if(isDemo)router.replace("/(tabs)/inbox");
        else void StorageService.shouldShowFirstRun(user.id).then(show=>{if(current)router.replace(show?"/getting-started":"/(tabs)/inbox");});
      } else {
        router.replace("/(auth)/welcome");
      }
    }
    return()=>{current=false;};
  }, [session, user, isDemo, isLoading, error, router]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {error ? (
        <ErrorState
          title="Could not start MergeMate"
          message={error}
          onRetry={() => {
            clearError();
            setTimedOut(false);
            router.replace("/(auth)/welcome");
          }}
        />
      ) : timedOut ? (
        <EmptyState
          icon="rocket-outline"
          title="Ready to get started"
          message="Continue to sign in or explore MergeMate in demo mode."
          actionTitle="Continue"
          onAction={() => router.replace("/(auth)/welcome")}
        />
      ) : (
        <View style={{padding:24,alignItems:"center",gap:24,maxWidth:480}}>
          <View style={{backgroundColor:colors.brandSubtle,width:88,height:88,borderRadius:28,alignItems:"center",justifyContent:"center"}}><Icon name="git-network-outline" size={42} color={colors.brandLight}/></View>
          <Image source={isDark?require("../assets/logo-dark.png"):require("../assets/logo-light.png")} style={{width:240,height:64}} resizeMode="contain" accessibilityLabel="MergeMate"/>
          <Text style={[typography.title2,{color:colors.text,textAlign:"center"}]}>Your developer review companion</Text>
          <View style={{flexDirection:"row",gap:16}}>{["Risk insights","AI summaries","Read-only"].map(label=><Text key={label} style={[typography.caption,{color:colors.textSecondary}]}>{label}</Text>)}</View>
          <ActivityIndicator color={colors.brandLight} accessibilityLabel="Starting MergeMate"/>
          <Text style={[typography.footnote,{color:colors.textSecondary}]}>AI insights. Human decisions.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
