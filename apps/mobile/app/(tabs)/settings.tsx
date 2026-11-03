import { ExperienceIntro } from "../../src/components/ExperienceDesign";
import { BuildIdentity } from "../../src/components/BuildIdentity";
import {QuietHoursEditor} from "../../src/components/QuietHoursEditor";
import {AccessibleSwitch as Switch} from "../../src/components/AccessibleSwitch";
import { SettingsGroup, SettingsRow } from "../../src/components/SettingsRows";
import { Avatar } from "../../src/components/Avatar";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, ScrollView, TouchableOpacity, StyleSheet, Platform, Linking, Alert, TextInput, KeyboardAvoidingView } from "react-native";
import { isExternalBillingLinkAllowed } from "../../src/platform/android";
import { Text } from "../../src/components/Text";
import { useRouter } from "expo-router";
import { useTheme } from "../../src/context/ThemeContext";
import { useAuth } from "../../src/context/AuthContext";
import { useConsent } from "../../src/context/ConsentContext";
import { api, apiMode } from "../../src/api";
import { webAppOrigin } from "../../src/api/config";
import { toUserMessage } from "../../src/api/errors";
import { StorageService } from "../../src/storage";
import { registerPush, unregisterPush } from "../../src/push/registration";
import { BillingPlan, UserSettings } from "../../src/types";
import { Header } from "../../src/components/Header";
import { Button } from "../../src/components/Button";
import { EmptyState } from "../../src/components/EmptyState";
import { ErrorState } from "../../src/components/ErrorState";
import { LoadingState } from "../../src/components/LoadingState";
import { useLayout } from "../../src/layout/useLayout";
import { Icon } from "../../src/components/Icon";
import { BrowserNotificationsRow } from "../../src/components/BrowserNotificationsRow";
import { billingStatusLabel } from "../../src/config/billing";
import { META_KEY_COPY } from "../../src/config/metaKeyCopy";

export default function SettingsScreen() {
  const router = useRouter();
  const {isDesktop}=useLayout();
  const { colors, typography, spacing, radius, themeMode, setThemeMode } = useTheme();
  const { user, signOut, isDemo } = useAuth();
  const { aiConsentGranted, needsReview, aiSummaries, pending: consentPending, revokeConsent, setAiSummaries, refreshConsent, error: consentError } = useConsent();

  const saveLock=useRef(false);
  const preferenceLock=useRef(false);
  const [saving,setSaving]=useState(false);
  const [preferenceBusy,setPreferenceBusy]=useState(false);
  const runPreference=async(action:()=>Promise<void>)=>{
    if(preferenceLock.current || saveLock.current)return;
    preferenceLock.current=true;setPreferenceBusy(true);
    try{await action();}finally{preferenceLock.current=false;setPreferenceBusy(false);}
  };
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [billing, setBilling] = useState<BillingPlan>({
    plan: "free",
    status: "none",
    trialEligible: false,
    canManage: false,
  });

  // null means this API does not offer the feature, so the section is left out.
  const [metaKey, setMetaKey] = useState<{ configured: boolean } | null>(null);
  const [metaKeyInput, setMetaKeyInput] = useState("");
  const [metaKeyBusy, setMetaKeyBusy] = useState(false);
  const [pushOn, setPushOn] = useState(false);

  const loadSettingsData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [fetchedSettings, fetchedPlan] = await Promise.all([
        api.getSettings(),
        api.getBillingPlan(),
      ]);
      setSettings(fetchedSettings);
      setBilling(fetchedPlan);
      api.getMetaKeyStatus().then(setMetaKey).catch(() => setMetaKey(null));
      if (Platform.OS !== "web") StorageService.getPushEnabled().then(setPushOn).catch(() => {});
    } catch (e) {
      setLoadError(toUserMessage(e, "Couldn't load your settings."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettingsData();
    void refreshConsent();
  }, [loadSettingsData, refreshConsent]);

  /** Saves a change to the API. The switch moves at once and snaps back, with the reason, if it is refused. */
  const saveSettings = async (patch: Partial<UserSettings>): Promise<boolean> => {
    if (!settings || saveLock.current) return false;
    saveLock.current=true;setSaving(true);
    const before = settings;
    setNotice(null);
    setSettings({ ...before, ...patch, notifications: { ...before.notifications, ...patch.notifications } });
    try {
      setSettings(await api.updateSettings(patch));
      return true;
    } catch (e) {
      setSettings(before);
      setNotice(toUserMessage(e, "Couldn't save that change."));
      return false;
    } finally{saveLock.current=false;setSaving(false);}
  };

  /** Turning AI on needs the disclosure first, so it opens the consent screen. Turning it off saves at once. */
  const toggleAiProcessing = async (val: boolean) => {
    setNotice(null);
    if (val) router.push("/(auth)/consent");
    else await revokeConsent();
  };

  const toggleAiSummaries = async (val: boolean) => {
    setNotice(null);
    await setAiSummaries(val);
  };

  const toggleQuietHours = async (on: boolean) => {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    await saveSettings({ quietHours: on ? { start: "22:00", end: "08:00", timeZone } : null });
  };

  const togglePush = async (on: boolean) => {
    setNotice(null);
    try {
      if (on) {
        const result = await registerPush(api, { prompt: true });
        if (result === "denied") setNotice("Notifications are off for MergeMate in your device settings.");
        if (result === "unavailable") setNotice("Push notifications aren't set up for this build yet.");
        setPushOn(result === "registered");
      } else {
        await unregisterPush(api);
        setPushOn(false);
      }
    } catch (e) {
      setNotice(toUserMessage(e, "Couldn't change push notifications."));
    }
  };

  const saveMetaKey = async () => {
    setMetaKeyBusy(true);
    setNotice(null);
    try {
      await api.saveMetaKey(metaKeyInput);
      setMetaKey({ configured: true });
      setNotice(META_KEY_COPY.saved);
    } catch (e) {
      setNotice(toUserMessage(e, "Couldn't save your Meta key."));
    } finally {
      // The key leaves the screen whether or not it was accepted.
      setMetaKeyInput("");
      setMetaKeyBusy(false);
    }
  };

  const removeMetaKey = async () => {
    setMetaKeyBusy(true);
    setNotice(null);
    try {
      await api.removeMetaKey();
      setMetaKey({ configured: false });
      setNotice(META_KEY_COPY.removed);
    } catch (e) {
      setNotice(toUserMessage(e, "Couldn't remove your Meta key."));
    } finally {
      setMetaKeyBusy(false);
    }
  };

  const canShowBillingRow = isExternalBillingLinkAllowed(Platform.OS);

  const handleManagePlan = () => {
    if (Platform.OS === "web") {
      router.push("/billing");
    } else if (canShowBillingRow) {
      // iOS App Store & Google Play compliant link-out to the web billing page (no in-app Stripe checkout).
      Linking.openURL(`${webAppOrigin(apiMode)}/billing`);
    }
  };

  const handleSignOut = async () => {
    if (Platform.OS === "web") {
      await signOut();
      router.replace("/(auth)/sign-in");
    } else {
      Alert.alert("Sign Out", "Are you sure you want to sign out?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out",
          style: "destructive",
          onPress: async () => {
            await signOut();
            router.replace("/(auth)/sign-in");
          },
        },
      ]);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={[styles.root, { backgroundColor: colors.background }]}>
      <Header title="Settings" />
      {isLoading ? (
        <LoadingState
          title="Loading settings..."
          message="Fetching your account preferences and plan status."
        />
      ) : loadError ? (
        <ErrorState
          title="Could not load settings"
          message={loadError}
          onRetry={loadSettingsData}
        />
      ) : !user && !isDemo && !settings ? (
        <EmptyState
          icon="settings-outline"
          title="Not signed in"
          message="Sign in with GitHub or start demo mode to manage your MergeMate settings."
          actionTitle="Go to Sign In"
          onAction={() => router.replace("/(auth)/sign-in")}
        />
      ) : (
        <ScrollView contentContainerStyle={{padding:isDesktop?24:16,paddingBottom:48}}>
          <View style={{marginBottom:24}}><ExperienceIntro compact eyebrow="Your workspace" title="Make it work your way." description="Keep your connections, agent workflows and preferences in one place."/></View>
          <SettingsGroup title="Agents & workflows"><SettingsRow first label="Open agent workspace" detail="Build workflows, inspect capabilities and follow each run" icon="git-network-outline" onPress={()=>router.push('/workflows')}/></SettingsGroup>
          {!!(notice || consentError) && <View accessibilityRole="alert" style={{padding:12,backgroundColor:colors.surfaceElevated,borderRadius:12,marginBottom:16}}><Text style={[typography.body,{color:colors.text}]}>{notice ?? consentError}</Text></View>}
          <SettingsGroup title="GitHub authentication">
            <View style={{flexDirection:"row",alignItems:"center",gap:12,padding:16}}><Avatar login={user?.login ?? 'demo'} size={40}/><View style={{flex:1}}><Text style={[typography.headline,{color:colors.text}]}>{user?.name || user?.login || 'Demo User'}</Text><Text style={[typography.code,{color:colors.textSecondary,fontSize:11}]}>@{user?.login || 'demo-developer'}</Text></View><View style={{paddingHorizontal:8,paddingVertical:4,borderRadius:9999,backgroundColor:isDemo?colors.demoBadgeBg:colors.riskLowBg}}><Text style={[typography.caption,{color:isDemo?colors.demoBadge:colors.riskLow}]}>{isDemo?'Demo':'Signed in'}</Text></View></View>
            <SettingsRow label="Sign Out" icon="log-out-outline" danger onPress={handleSignOut}/>
          </SettingsGroup>
          <SettingsGroup title="Workspace repositories">
            <SettingsRow first label="Configure repositories" detail="Manage which repositories appear in your inbox" icon="folder-open-outline" onPress={()=>router.push('/(auth)/repos')}/>
            {canShowBillingRow && <SettingsRow label={Platform.OS==='web'?'Manage Billing & Plans':'Manage Plan'} detail={billingStatusLabel(billing.status)} icon="card-outline" onPress={handleManagePlan} trailing={<View style={{flexDirection:'row',alignItems:'center',gap:8}}><View style={{paddingHorizontal:8,paddingVertical:3,borderRadius:9999,backgroundColor:colors.brandSubtle}}><Text style={[typography.caption,{color:colors.brandLight,textTransform:'uppercase'}]}>{billing.plan}</Text></View><Icon name="chevron-forward" size={16} color={colors.textSecondary}/></View>}/>}
          </SettingsGroup>
          <SettingsGroup title="Push notifications & triage">
            {([['review','Review requests','When someone asks for your review'],['mention','Mentions','When someone mentions you'],['mine','My pull requests','Updates to pull requests you opened']] as const).map(([kind,label,hint],index)=><SettingsRow key={kind} first={index===0} label={label} detail={hint} trailing={<Switch value={settings?.notifications[kind] ?? true} onValueChange={value=>{if(settings)void saveSettings({notifications:{...settings.notifications,[kind]:value}});}} disabled={isDemo || !settings || saving || preferenceBusy} accessibilityLabel={label} trackColor={{false:colors.surfaceSecondary,true:colors.brand}} thumbColor="#FFFFFF"/>}/>)}
            <SettingsRow label="Quiet Hours" detail={settings?.quietHours?`${settings.quietHours.start} → ${settings.quietHours.end}`:'22:00 → 08:00 when enabled'} icon="moon-outline" trailing={<Switch value={settings?.quietHours!=null} onValueChange={value=>runPreference(()=>toggleQuietHours(value))} disabled={isDemo || !settings || saving || preferenceBusy} accessibilityLabel="Quiet hours" trackColor={{false:colors.surfaceSecondary,true:colors.brand}} thumbColor="#FFFFFF"/>}/>
            <QuietHoursEditor value={settings?.quietHours??null} disabled={isDemo||!settings||saving||preferenceBusy} onSave={quietHours=>saveSettings({quietHours})}/>
            {Platform.OS!=='web' && !isDemo && <SettingsRow label="Push on this device" detail="Get a push when a review needs you" trailing={<Switch value={pushOn} onValueChange={value=>runPreference(()=>togglePush(value))} disabled={saving || preferenceBusy} accessibilityLabel="Push notifications on this device" trackColor={{false:colors.surfaceSecondary,true:colors.brand}} thumbColor="#FFFFFF"/>}/>}
            {Platform.OS==='web' && !isDemo && <BrowserNotificationsRow onNotice={setNotice}/>}
          </SettingsGroup>
          <SettingsGroup title="Intelligence & privacy">
            <SettingsRow first label="AI processing" detail={needsReview ? "The consent text changed. Review it to keep using AI." : "Master switch for AI. Lets MergeMate send PR text, screenshots and voice notes you choose to an AI model"} icon="sparkles-outline" trailing={<Switch value={aiConsentGranted} onValueChange={value=>runPreference(()=>toggleAiProcessing(value))} disabled={isDemo || preferenceBusy || consentPending!==null} accessibilityLabel="AI processing" trackColor={{false:colors.surfaceSecondary,true:colors.brand}} thumbColor="#FFFFFF"/>}/>
            <SettingsRow child dimmed={!aiConsentGranted} label="AI summaries and risk" detail={aiConsentGranted?"Analyze PRs automatically when you open them or load your inbox. Turn off to analyze only when you ask.":"Part of AI processing. Turn AI processing on to use this."} trailing={<Switch value={aiConsentGranted && aiSummaries} onValueChange={value=>runPreference(()=>toggleAiSummaries(value))} disabled={isDemo || !aiConsentGranted || preferenceBusy || consentPending!==null} accessibilityLabel="AI summaries and risk" trackColor={{false:colors.surfaceSecondary,true:colors.brand}} thumbColor="#FFFFFF"/>}/>
            <SettingsRow label="What is sent to AI" detail="Review your consent and privacy choices" icon="shield-checkmark-outline" onPress={()=>router.push('/(auth)/consent')}/>
          </SettingsGroup>
          {metaKey && !isDemo && <SettingsGroup title="Your Meta key">
            <SettingsRow first label={metaKey.configured?META_KEY_COPY.usingKey:META_KEY_COPY.noKey} detail="Stored encrypted and never shown again" icon="key-outline"/>
            {Platform.OS==='web'?<View style={{padding:16,paddingTop:0}}><TextInput value={metaKeyInput} onChangeText={setMetaKeyInput} placeholder={metaKey.configured?'Paste a replacement key':'Paste your Meta key'} placeholderTextColor={colors.textSecondary} secureTextEntry autoCapitalize="none" autoCorrect={false} spellCheck={false} autoComplete="off" accessibilityLabel="Meta key" style={[styles.keyInput,{color:colors.text,backgroundColor:colors.surfaceElevated,borderColor:colors.border,borderRadius:12}]}/><Text style={[typography.caption,{color:colors.textSecondary,marginTop:8}]} accessibilityRole="text">{metaKeyBusy?META_KEY_COPY.checking:META_KEY_COPY.verifyNotice}</Text><Button title={META_KEY_COPY.saveLabel} variant="secondary" onPress={saveMetaKey} loading={metaKeyBusy} disabled={metaKeyInput.trim().length===0} style={{marginTop:8}}/>{metaKey.configured && <Button title="Remove key" variant="ghost" onPress={removeMetaKey} disabled={metaKeyBusy || saving || preferenceBusy}/>}</View>:<Text style={[typography.caption,{color:colors.textSecondary,padding:16,paddingTop:0}]}>{META_KEY_COPY.nativeNote}</Text>}
          </SettingsGroup>}
          <SettingsGroup title="Appearance">
            <SettingsRow first label="Interface Theme" icon="contrast-outline"/>
            <View accessibilityRole="radiogroup" style={{flexDirection:'row',gap:4,padding:8,paddingTop:0}}>{(['system','dark','light'] as const).map(mode=><TouchableOpacity key={mode} onPress={()=>setThemeMode(mode)} accessibilityRole="radio" accessibilityLabel={`${mode} theme`} accessibilityState={{checked:themeMode===mode}} aria-checked={themeMode===mode} style={{flex:1,minHeight:44,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,borderRadius:8,backgroundColor:themeMode===mode?colors.surfaceInteractive:'transparent'}}><Icon name={mode==='system'?'desktop-outline':mode==='dark'?'moon-outline':'sunny-outline'} size={16} color={themeMode===mode?colors.text:colors.textSecondary}/><Text style={[typography.caption,{color:themeMode===mode?colors.text:colors.textSecondary,textTransform:'capitalize'}]}>{mode}</Text></TouchableOpacity>)}</View>
          </SettingsGroup>
          <SettingsGroup title="Information & security">
            {([{label:"What's New (Changelog)",route:'/(public)/changelog'},{label:'Product News',route:'/(public)/news'},{label:'Support',route:'/(public)/support'},{label:'Privacy Policy',route:'/(public)/privacy'},{label:'Terms of Service',route:'/(public)/terms'}] as const).map((item,index)=><SettingsRow key={item.route} first={index===0} label={item.label} onPress={()=>router.push(item.route)}/>)}
          </SettingsGroup>
          <BuildIdentity />
          <SettingsGroup title="Danger zone"><SettingsRow first label="Delete Account & Revoke Access" detail="Permanently remove your account and revoke GitHub access" icon="trash-outline" danger onPress={()=>router.push('/account/delete')}/></SettingsGroup>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles=StyleSheet.create({root:{flex:1},keyInput:{fontFamily:'Geist_400Regular',minHeight:48,padding:12,borderWidth:1}});
