import { InfoLine, Section } from "../../src/components/ScreenDesign";
import React, { useState, useRef } from "react";
import { View, ScrollView, StyleSheet, Alert, Platform, Linking } from "react-native";
import { Text } from "../../src/components/Text";
import { useRouter } from "expo-router";
import { useTheme } from "../../src/context/ThemeContext";
import { useAuth } from "../../src/context/AuthContext";
import { toUserMessage } from "../../src/api/errors";
import { Header } from "../../src/components/Header";
import { Button } from "../../src/components/Button";
import { EmptyState } from "../../src/components/EmptyState";
import { ErrorState } from "../../src/components/ErrorState";
import { LoadingState } from "../../src/components/LoadingState";

export default function DeleteAccountScreen() {
  const router = useRouter();
  const { colors, typography, spacing } = useTheme();
  const { deleteAccount, user, isDemo, signOut, signInWithGithub } = useAuth();
  const submitting=useRef(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmDelete = async () => {
    if(submitting.current || !user || isDemo)return;submitting.current=true;
    setIsDeleting(true);
    setError(null);
    try {
      await deleteAccount();
      router.replace("/(auth)/sign-in");
    } catch (e) {
      setError(`${toUserMessage(e, "Failed to delete account.")} If it keeps failing, contact support@mergemate.dev.`);
      setIsDeleting(false);
    } finally {submitting.current=false;}
  };

  const handleDeletePress = () => {
    if (Platform.OS === "web") {
      if (window.confirm("Permanently delete your MergeMate account? This action cannot be undone.")) {
        confirmDelete();
      }
    } else {
      Alert.alert(
        "Delete Account",
        "Permanently delete your MergeMate account? We will cancel billing, revoke app access and remove your stored data. If a step fails, you can retry to finish.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Permanently Delete", style: "destructive", onPress: confirmDelete },
        ]
      );
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Header title="Delete Account" showBack />
      {isDeleting ? (
        <LoadingState
          title="Deleting your account..."
          message="Revoking GitHub access and removing your stored data."
        />
      ) : error ? (
        <View style={{flex:1}}><ErrorState
          title="Couldn't delete account"
          message={error}
          onRetry={confirmDelete}
          retryLabel="Retry deletion"
        />
          <View style={{padding:spacing.base,gap:spacing.sm}}>
            <Text style={[typography.body,{color:colors.textSecondary}]}>Deletion has not finished. You can retry, sign in with GitHub again if access needs renewing, or contact support.</Text>
            <Button title="Sign in again with GitHub" onPress={()=>void signInWithGithub(Platform.OS==='web'?'web':Platform.OS==='android'?'android':'ios')} variant="secondary"/>
            <Button title="Contact support" onPress={()=>void Linking.openURL('mailto:support@mergemate.dev')} variant="secondary"/>
            <Button title="Sign out" onPress={()=>void signOut()} variant="ghost"/>
          </View>
        </View>
      ) : isDemo ? (
        <EmptyState icon="person-outline" title="No account to delete in the demo" message="The demo does not create a personal MergeMate account." actionTitle="Exit demo" onAction={()=>void signOut()}/>
      ) : !user ? (
        <EmptyState
          icon="person-outline"
          title="No active account signed in"
          message="Sign in to manage or delete your MergeMate account."
          actionTitle="Go to Sign In"
          onAction={() => router.replace("/(auth)/sign-in")}
        />
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { padding: spacing.xl }]}>

          <Text style={[typography.footnote,{color:colors.textSecondary,marginBottom:12,alignSelf:"flex-start"}]}>Account: @{user.login}</Text>
          {user.deletionPending && <Text accessibilityRole="alert" style={[typography.body,{color:colors.textSecondary,marginBottom:spacing.md}]}>A previous deletion request is unfinished. Other account activity is paused until you finish deletion.</Text>}
          <Section title="What will be removed" style={{width:"100%"}}>
            <InfoLine icon="card-outline" title="Subscription canceled" detail="Any active subscription ends as part of deletion."/>
            <InfoLine icon="lock-closed-outline" title="GitHub access revoked" detail="MergeMate's authorization is revoked and your sessions are ended."/>
            <InfoLine icon="trash-outline" title="Stored data removed" detail="Cached summaries, settings and review metadata are purged."/>
          </Section>
          <View style={{padding:16,backgroundColor:colors.riskHighBg,borderRadius:12,width:"100%",marginTop:16}}><Text style={[typography.body,{color:colors.riskHigh}]}>This action cannot be undone. Your repositories and pull requests on GitHub are not deleted.</Text></View>

          <Text style={[typography.footnote,{color:colors.textSecondary,marginTop:spacing.md}]}>A minimal deletion receipt expires after seven days. Billing provider records and shared service security records are handled separately.</Text>
          <View style={[styles.actions, { marginTop: spacing.xl }]}>
            <Button
              title={user.deletionPending?"Finish account deletion":"Permanently Delete Account"}
              onPress={handleDeletePress}
              loading={isDeleting}
              variant="destructive"
              style={{ width: "100%" }}
            />
            <Button
              title={user.deletionPending?"Sign out":"Cancel"}
              onPress={() => user.deletionPending?void signOut():router.back()}
              variant="secondary"
              style={{ width: "100%", marginTop: spacing.sm }}
            />
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    alignItems: "center",
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
  },
  actions: {
    width: "100%",
  },
});
