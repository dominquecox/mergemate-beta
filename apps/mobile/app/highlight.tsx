import {PrivateNotes} from "../src/components/PrivateNotes";
import {useFocusEffect,useRouter} from "expo-router";
import {useConsent} from "../src/context/ConsentContext";
import {useAuth} from "../src/context/AuthContext";
import {onSessionChange} from "../src/auth/session-events";
import {releasePickedImage} from "../src/highlight/cleanup";
import {useFeatureFlags} from "../src/hooks/useFeatureFlags";
import { Section } from "../src/components/ScreenDesign";
import React, { useState,useRef,useCallback,useEffect } from "react";
import { AppState,View, ScrollView, TextInput, StyleSheet, Image, Platform, TouchableOpacity, KeyboardAvoidingView } from "react-native";
import { Text } from "../src/components/Text";
import * as ImagePicker from "expo-image-picker";
import { useTheme } from "../src/context/ThemeContext";
import { api } from "../src/api";
import { toUserMessage } from "../src/api/errors";
import { HighlightResult } from "../src/types";
import { Header } from "../src/components/Header";
import { Button } from "../src/components/Button";
import { Card } from "../src/components/Card";
import { EmptyState } from "../src/components/EmptyState";
import { ErrorState } from "../src/components/ErrorState";
import { LoadingState } from "../src/components/LoadingState";
import { Icon } from "../src/components/Icon";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export default function HighlightScreen() {
  const { colors, typography, spacing, radius } = useTheme();

  const flags=useFeatureFlags();const {aiConsentGranted}=useConsent(),{isDemo,user}=useAuth();const router=useRouter();
  const sequence=useRef(0),pending=useRef<AbortController|null>(null),selected=useRef<ImagePicker.ImagePickerAsset|null>(null),lock=useRef(false);
  const [flagBlocked,setFlagBlocked]=useState(false);
  const abort=()=>{sequence.current++;pending.current?.abort();pending.current=null;lock.current=false;};
  const clear=useCallback(()=>{sequence.current++;pending.current?.abort();pending.current=null;lock.current=false;const old=selected.current;selected.current=null;if(old)void releasePickedImage(old.uri).catch(()=>{});},[]);
  useFocusEffect(useCallback(()=>{setFlagBlocked(false);return()=>{clear();setImage(null);setResult(null);setIsAnalyzing(false);setNote("");};},[clear]));
  useEffect(()=>{
    const reset=()=>{clear();setImage(null);setResult(null);setIsAnalyzing(false);setNote("");};
    const off=onSessionChange(reset),app=AppState.addEventListener('change',state=>{if(state!=='active')reset();});
    const hidden=()=>{if(document.visibilityState!=='visible')reset();};
    if(Platform.OS==='web')document.addEventListener('visibilitychange',hidden);
    return()=>{off();app.remove();if(Platform.OS==='web')document.removeEventListener('visibilitychange',hidden);clear();};
  },[clear]);
  useEffect(()=>{clear();setImage(null);setResult(null);setIsAnalyzing(false);setNote("");},[user?.id,clear]);
  useEffect(()=>{if(!flags.highlight || !aiConsentGranted){clear();setImage(null);setResult(null);setIsAnalyzing(false);}},[flags.highlight,aiConsentGranted,clear]);
  const [previewWidth,setPreviewWidth]=useState(300);
  const [note, setNote] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<HighlightResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [image, setImage] = useState<ImagePicker.ImagePickerAsset | null>(null);

  const accept = async(picked:ImagePicker.ImagePickerResult)=>{
    if(picked.canceled || !picked.assets[0])return;const asset=picked.assets[0];
    const type=(asset.mimeType??"").toLowerCase();
    if((type && !ALLOWED_TYPES.includes(type)) || asset.width<1 || asset.height<1 || asset.width>8192 || asset.height>8192 || asset.width*asset.height>16*1024*1024){await releasePickedImage(asset.uri);setError("Use a still JPEG, PNG or WebP, at most 16 megapixels and 8192 pixels per side.");return;}
    if(asset.fileSize && asset.fileSize>MAX_IMAGE_BYTES){await releasePickedImage(asset.uri);setError("That image is too large. Pick one under 5 MB.");return;}
    const old=selected.current;selected.current=asset;setImage(asset);setResult(null);setError(null);if(old&&old.uri!==asset.uri)await releasePickedImage(old.uri);
  };
  const pick=async(camera=false)=>{
    if(!flags.highlight||!aiConsentGranted||isDemo)return;abort();setIsAnalyzing(false);setResult(null);setError(null);const version=sequence.current;
    try{
      if(camera){const permission=await ImagePicker.requestCameraPermissionsAsync();if(version!==sequence.current)return;if(!permission.granted){setError("Camera access is off. Choose a screenshot from your library instead.");return;}}
      const options={mediaTypes:["images"] as const,quality:1,exif:false};
      const picked=camera?await ImagePicker.launchCameraAsync({...options,mediaTypes:["images"]}):await ImagePicker.launchImageLibraryAsync({...options,mediaTypes:["images"]});
      if(version!==sequence.current){for(const asset of picked.assets??[])await releasePickedImage(asset.uri);return;}
      await accept(picked);
    }catch{if(version===sequence.current)setError("Could not open that image. Choose a different screenshot or check camera access.");}
  };
  const pickFromLibrary=()=>pick(false),takePhoto=()=>pick(true);
  const handleAnalyze=async()=>{
    if(!flags.highlight||!aiConsentGranted||isDemo||lock.current)return;
    if(!image){setError("Choose a screenshot first.");return;}lock.current=true;const version=sequence.current;const controller=new AbortController();pending.current=controller;setIsAnalyzing(true);setError(null);setResult(null);
    try{
      const [latest,consent]=await Promise.all([api.getFeatureFlags(true),api.getConsent()]);if(version!==sequence.current)return;
      if(!latest.highlight){setFlagBlocked(true);clear();setImage(null);return;}
      if(!consent.ai.granted||consent.ai.version!=="1")throw new Error("Consent required");
      const res=await api.analyzeHighlight(image.uri,note,image.mimeType??undefined,controller.signal);
      if(version===sequence.current)setResult(res);
    }catch(e){if(version===sequence.current)setError(toUserMessage(e,"Could not analyze this screenshot. Check AI consent or try again."));}
    finally{if(version===sequence.current){lock.current=false;pending.current=null;setIsAnalyzing(false);}}
  };

  if(!flags.highlight||flagBlocked)return <View style={[styles.root,{backgroundColor:colors.background}]}><Header title="Screenshot Insight" showBack/><EmptyState icon="image-outline" title="Screenshot highlight is unavailable" message="This feature isn’t enabled. You can keep reviewing pull requests from Inbox."/></View>;

  if(isDemo || !aiConsentGranted)return <View style={[styles.root,{backgroundColor:colors.background}]}><Header title="Screenshot Insight" showBack/><EmptyState icon="shield-checkmark-outline" title={isDemo?"Screenshots are unavailable in demo mode":"AI consent is required"} message="Your screenshot is shared with the configured AI provider only after you choose to analyze it." actionTitle="Open Settings" onAction={()=>router.push('/settings')}/></View>;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={[styles.root, { backgroundColor: colors.background }]}>
      <Header title="Screenshot Insight" showBack />
      <ScrollView contentContainerStyle={{ padding: spacing.base, paddingBottom: 60 }}>

        {/* Intro Card */}
        <Section title="Meta AI Vision Analysis" icon="image-outline">
          <Text style={[typography.body, { color: colors.textSecondary }]}>
            Capture or upload a PR screenshot or UI diff. Get an explanation and suggested areas to inspect. Boxes are approximate AI suggestions, not precise measurements.
          </Text>

          <TouchableOpacity
            onPress={pickFromLibrary}
            accessibilityRole="button"
            accessibilityLabel={image ? "Choose a different screenshot" : "Choose a screenshot"}
            style={[styles.uploadBox, { backgroundColor: colors.surfaceElevated, borderColor: colors.border, borderRadius: radius.md, marginTop: spacing.md }]}
          >
            {image ? (
              <>
                <View style={{width:"100%",alignItems:"center"}} onLayout={event=>setPreviewWidth(Math.max(1,event.nativeEvent.layout.width))}><View style={{width:Math.min(previewWidth,520*image.width/image.height),height:Math.min(previewWidth*image.height/image.width,520),position:"relative"}}>
                  <Image source={{uri:image.uri}} style={{width:"100%",height:"100%"}} resizeMode="contain" accessibilityLabel="Selected screenshot"/>
                  {result?.regions.map((region,index)=><View key={region.id} pointerEvents="none" style={{position:"absolute",left:`${region.x/10}%`,top:`${region.y/10}%`,width:`${region.width/10}%`,height:`${region.height/10}%`,borderWidth:2,borderColor:colors.brandLight}}><Text style={{color:colors.text,backgroundColor:colors.surface}}>{index+1}</Text></View>)}
                </View></View>
                <Text style={[typography.caption, { color: colors.textMuted, marginTop: 8 }]}>
                  {image.width} × {image.height} px · Tap to choose another
                </Text>
              </>
            ) : (
              <>
                <Icon name="image-outline" size={34} color={colors.brandLight} />
                <Text style={[typography.headline, { color: colors.brandLight, marginTop: 8 }]}>Choose a screenshot</Text>
                <Text style={[typography.caption, { color: colors.textMuted }]}>JPEG, PNG or WebP · up to 5 MB</Text>
              </>
            )}
          </TouchableOpacity>
          {Platform.OS !== "web" && (
            <Button title="Take a photo" onPress={takePhoto} variant="secondary" style={{ marginTop: spacing.sm }} />
          )}

          <View style={{flexDirection:"row",alignItems:"center",gap:8,marginTop:16,padding:12,backgroundColor:colors.riskLowBg,borderRadius:12}}><Icon name="shield-checkmark-outline" size={16} color={colors.riskLow}/><Text style={[typography.footnote,{color:colors.riskLow,flex:1}]}>Screenshots are processed in memory and are not saved on our servers.</Text></View>
          <Text style={[typography.subhead, { color: colors.textSecondary, marginTop: spacing.md }]}>
            Optional Reviewer Note
          </Text>
          <TextInput
            maxLength={500}
            value={note}
            onChangeText={value=>{abort();setIsAnalyzing(false);setResult(null);setNote(value);}}
            placeholder="e.g. Check button padding on mobile"
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="Optional reviewer note"
            style={[
              styles.input,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.border,
                color: colors.text,
                borderRadius: radius.md,
                marginTop: 4,
              },
            ]}
          />

          <Button
            title="Analyze Screenshot with AI"
            onPress={handleAnalyze}
            loading={isAnalyzing}
            disabled={!image}
            variant="primary"
            style={{ marginTop: spacing.md, ...(!image && { backgroundColor: colors.surfaceInteractive, borderWidth: 1, borderColor: colors.border }) }}
            textStyle={!image ? { color: colors.textMuted } : undefined}
          />
          {!image && <Text style={[typography.caption, { color: colors.textMuted, marginTop: 6, textAlign: "center" }]}>Choose a screenshot to enable analysis.</Text>}
          {image && <Button title={isAnalyzing?"Cancel analysis and remove image":"Remove screenshot"} variant="ghost" onPress={()=>{clear();setImage(null);setResult(null);setIsAnalyzing(false);setError(null);}}/>}
        </Section>

        {isAnalyzing ? (
          <LoadingState
            title="Analyzing screenshot..."
            message="Checking layout, spacing, and contrast regions with Meta AI."
          />
        ) : error ? (
          <ErrorState
            title="Couldn't analyze screenshot"
            message={error}
            onRetry={image ? handleAnalyze : undefined}
            retryLabel="Try Again"
          />
        ) : result ? (
          <View style={{ marginTop: spacing.base }}>
            <Card>
              <View style={styles.insightTitleRow}>
                <Icon name="sparkles" size={16} color={colors.brandLight} />
                <Text style={[typography.headline, { color: colors.brandLight }]} accessibilityRole="header">
                  AI Visual Insight
                </Text>
              </View>
              <Text style={[typography.body, { color: colors.text, marginTop: 6, lineHeight: 22 }]}>
                {result.insight}
              </Text>

              {result.regions.length > 0 && (
                <Text style={[typography.subhead, { color: colors.textMuted, marginTop: spacing.md, textTransform: "uppercase" }]}>
                  Suggested areas ({result.regions.length}) · AI estimates
                </Text>
              )}

              {result.regions.length===0 && <Text style={[typography.body,{color:colors.textSecondary,marginTop:12}]}>No reliable region was suggested. Read the explanation and inspect the image yourself.</Text>}
              {result.regions.map((reg,index) => (
                <View
                  key={reg.id}
                  style={[
                    styles.regionCard,
                    { backgroundColor: colors.surfaceElevated, borderColor: colors.border, borderRadius: radius.md },
                  ]}
                >
                  <View style={styles.regionHeader}>
                    <Text style={[typography.headline, { color: colors.text,flexShrink:1,maxWidth:"100%" }]}>{index+1}. {reg.label}</Text>
                    <Text style={[typography.caption, { color: colors.brandLight }]}>
                      {Math.round(reg.x / 10)}% from left · {Math.round(reg.y / 10)}% from top
                    </Text>
                  </View>

                </View>
              ))}

              <View style={[styles.noticeRow, { marginTop: spacing.md }]}>
                <Icon name="lock-closed-outline" size={14} color={colors.textMuted} style={styles.noticeIcon} />
                <Text style={[typography.caption, { color: colors.textMuted, flex: 1 }]}>
                  The server did not save your screenshot. These suggestions may be wrong; verify them against the image.
                </Text>
              </View>
            </Card>
          </View>
        ) : null}
        <PrivateNotes context={{kind:"highlight"}}/>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  noticeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  noticeIcon: {
    marginTop: 1,
  },
  insightTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  root: {
    flex: 1,
  },
  uploadBox: {
    minHeight: 220,
    padding: 24,
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    fontFamily: "Geist_400Regular",
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
  },
  regionCard: {
    padding: 12,
    borderWidth: 1,
    marginTop: 8,
  },
  regionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap:"wrap",
    gap:8,
  },
});
