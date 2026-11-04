import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api } from "../src/api";
import { Button } from "../src/components/Button";
import { EmptyState } from "../src/components/EmptyState";
import { ErrorState } from "../src/components/ErrorState";
import { Header } from "../src/components/Header";
import { Icon, type IconName } from "../src/components/Icon";
import { LoadingState } from "../src/components/LoadingState";
import { Text } from "../src/components/Text";
import { useAuth } from "../src/context/AuthContext";
import { useTheme } from "../src/context/ThemeContext";
import { StorageService } from "../src/storage";

interface PreviewPr { repo: string; number: number; title: string; author: string; risk?: "low" | "medium" | "high"; summary?: string; sample: boolean }

const SAMPLE_PR: PreviewPr = {
  repo: "sample/review-app",
  number: 42,
  title: "Tighten session validation at the API boundary",
  author: "sample-engineer",
  risk: "medium",
  summary: "Updates authentication checks and adds focused regression coverage.",
  sample: true,
};

const STEPS: ReadonlyArray<{ title: string; eyebrow: string; detail: string; icon: IconName }> = [
  { eyebrow: "Inbox", title: "Start with what needs you", detail: "MergeMate sorts review requests, mentions and your pull requests so the highest-risk work is visible first.", icon: "file-tray-full-outline" },
  { eyebrow: "Pull request", title: "Open the change, not the noise", detail: "Tap a pull request to see the decision context, files, checks and discussion in one workspace.", icon: "git-pull-request-outline" },
  { eyebrow: "Summary and risk", title: "Get the five-second verdict", detail: "Read the grounded AI summary and risk reasons first, then inspect the cited evidence before deciding.", icon: "sparkles-outline" },
  { eyebrow: "Triage", title: "Route the queue in seconds", detail: "Use Ignore, FYI and Needs You to clear the queue while preserving the work that deserves attention.", icon: "albums-outline" },
  { eyebrow: "Automate", title: "Put an agent on the next step", detail: "Choose a PR to review or a branch to fix, inspect the generated workflow, and keep approval in your hands.", icon: "git-network-outline" },
];

export default function GettingStartedScreen() {
  const router = useRouter();
  const { replay } = useLocalSearchParams<{ replay?: string }>();
  const { user, isDemo } = useAuth();
  const { colors, typography, spacing, radius } = useTheme();
  const [ready, setReady] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [step, setStep] = useState(0);
  const [preview, setPreview] = useState<PreviewPr>(SAMPLE_PR);

  useEffect(() => {
    let current = true;
    const load = async () => {
      if (!user || isDemo) { router.replace("/(tabs)/inbox"); return; }
      let shouldShow: boolean;
      try { shouldShow = replay === "1" || await StorageService.shouldShowFirstRun(user.id); }
      catch { if(current)setFatal("Your walkthrough preference could not be loaded. Try again."); return; }
      if (!shouldShow) { router.replace("/(tabs)/inbox"); return; }
      try {
        const page = await api.getNotificationPage("all");
        const item = page.items[0];
        if (item && current) setPreview({ repo: item.repo, number: item.number, title: item.title, author: item.author, risk: item.risk, summary: item.summaryLine, sample: false });
      } catch {
        // The walkthrough remains useful with its labeled sample while Inbox can retry independently.
      }
      if (current) setReady(true);
    };
    void load();
    return () => { current = false; };
  }, [isDemo, replay, refresh, router, user]);

  const finish = async () => {
    if (user) await StorageService.completeFirstRun(user.id);
    router.replace("/(tabs)/inbox");
  };

  if (fatal) return <ErrorState title="Could not open getting started" message={fatal} onRetry={()=>{setFatal(null);setReady(false);setRefresh(value=>value+1);}} />;
  if (!ready || !user) return <LoadingState title="Preparing your workspace..." message="Finding the best place to start." />;
  const current = STEPS[step];
  if (!current) return <EmptyState title="Getting started is complete" message="Open your inbox to continue reviewing." actionTitle="Open Inbox" onAction={()=>void finish()}/>;
  const final = step === STEPS.length - 1;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Header title="Getting started" rightAction={<TouchableOpacity accessibilityRole="button" accessibilityLabel="Skip getting started" onPress={()=>void finish()} style={styles.skip}><Text style={[typography.subhead,{color:colors.textSecondary,fontWeight:"600"}]}>Skip</Text></TouchableOpacity>} />
      <ScrollView contentContainerStyle={[styles.content,{padding:spacing.base}]} showsVerticalScrollIndicator={false}>
        <View accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: STEPS.length, now: step + 1 }} style={styles.progress}>
          {STEPS.map((item,index)=><View key={item.eyebrow} style={[styles.progressBar,{backgroundColor:index<=step?colors.brandLight:colors.surfaceSecondary}]}/>) }
        </View>

        <View style={[styles.hero,{backgroundColor:colors.surface,borderColor:colors.border,borderRadius:radius.lg}]}>
          <View style={[styles.icon,{backgroundColor:colors.brandSubtle}]}><Icon name={current.icon} size={28} color={colors.brandLight}/></View>
          <Text style={[typography.caption,{color:colors.brandLight,fontWeight:"700",textTransform:"uppercase"}]}>Step {step+1} of {STEPS.length} · {current.eyebrow}</Text>
          <Text accessibilityRole="header" style={[typography.title1,{color:colors.text}]}>{current.title}</Text>
          <Text style={[typography.body,{color:colors.textSecondary,lineHeight:24}]}>{current.detail}</Text>
        </View>

        {(step===1||step===2) && <View style={[styles.preview,{backgroundColor:colors.surfaceElevated,borderColor:colors.border,borderRadius:radius.md}]}>
          <View style={styles.previewTop}><Text style={[typography.code,{color:colors.textMuted,fontSize:11}]}>{preview.sample?"SAMPLE · ":""}{preview.repo} #{preview.number}</Text>{preview.risk&&<View style={[styles.risk,{backgroundColor:preview.risk==="high"?colors.riskHighBg:preview.risk==="medium"?colors.riskMediumBg:colors.riskLowBg}]}><Text style={[typography.caption,{color:preview.risk==="high"?colors.riskHigh:preview.risk==="medium"?colors.riskMedium:colors.riskLow,fontWeight:"700"}]}>{preview.risk.toUpperCase()} RISK</Text></View>}</View>
          <Text style={[typography.headline,{color:colors.text}]}>{preview.title}</Text>
          <Text style={[typography.caption,{color:colors.textSecondary}]}>Opened by @{preview.author}</Text>
          {step===2&&<View style={[styles.summary,{backgroundColor:colors.brandSubtle}]}><Icon name="sparkles-outline" size={16} color={colors.brandLight}/><Text style={[typography.body,{color:colors.text,flex:1}]}>{preview.summary??"MergeMate summarizes the change and identifies the evidence to review before shipping."}</Text></View>}
        </View>}

        {step===3&&<View style={styles.choices}>{[["close-circle-outline","Ignore"],["information-circle-outline","FYI"],["alert-circle-outline","Needs You"]].map(([icon,label])=><View key={label} style={[styles.choice,{backgroundColor:colors.surface,borderColor:colors.border,borderRadius:radius.md}]}><Icon name={icon as IconName} size={20} color={colors.brandLight}/><Text style={[typography.subhead,{color:colors.text,fontWeight:"600"}]}>{label}</Text></View>)}</View>}
        {step===4&&<View style={[styles.flow,{backgroundColor:colors.surface,borderColor:colors.border,borderRadius:radius.md}]}>{["Choose a PR or branch","Inspect the agent plan","Approve only the exact result"].map((label,index)=><View key={label} style={styles.flowRow}><View style={[styles.flowNumber,{backgroundColor:colors.brandSubtle}]}><Text style={[typography.code,{color:colors.brandLight}]}>{index+1}</Text></View><Text style={[typography.body,{color:colors.text,flex:1}]}>{label}</Text></View>)}</View>}
      </ScrollView>
      <View style={[styles.footer,{borderTopColor:colors.border,backgroundColor:colors.background}]}>
        {step>0&&<Button title="Back" variant="secondary" onPress={()=>setStep(value=>value-1)} style={{flex:1}}/>}
        <Button title={final?"Open my inbox":"Continue"} onPress={()=>final?void finish():setStep(value=>value+1)} style={{flex:2}}/>
      </View>
    </View>
  );
}

const styles=StyleSheet.create({root:{flex:1},skip:{minHeight:44,minWidth:56,alignItems:"center",justifyContent:"center"},content:{gap:16,paddingBottom:28},progress:{flexDirection:"row",gap:6},progressBar:{height:4,flex:1,borderRadius:999},hero:{padding:20,borderWidth:1,gap:12},icon:{width:52,height:52,borderRadius:16,alignItems:"center",justifyContent:"center"},preview:{padding:16,borderWidth:1,gap:8},previewTop:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:8},risk:{paddingHorizontal:8,paddingVertical:4,borderRadius:999},summary:{marginTop:6,padding:12,borderRadius:12,flexDirection:"row",gap:8,alignItems:"flex-start"},choices:{gap:10},choice:{minHeight:56,paddingHorizontal:16,borderWidth:1,flexDirection:"row",gap:10,alignItems:"center"},flow:{padding:16,borderWidth:1,gap:12},flowRow:{minHeight:44,flexDirection:"row",alignItems:"center",gap:12},flowNumber:{width:32,height:32,borderRadius:10,alignItems:"center",justifyContent:"center"},footer:{padding:16,borderTopWidth:StyleSheet.hairlineWidth,flexDirection:"row",gap:10}});
