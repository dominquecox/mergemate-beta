import { useRouter } from "expo-router";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, StyleSheet, TouchableOpacity, ScrollView, Platform } from "react-native";
import { Text } from "../../src/components/Text";
import { useTheme } from "../../src/context/ThemeContext";
import { api } from "../../src/api";
import { toUserMessage } from "../../src/api/errors";
import { TriageItem, TriageLane, PrDetail, Notification } from "../../src/types";
import { Header } from "../../src/components/Header";
import { Section } from "../../src/components/ScreenDesign";
import { EmptyState } from "../../src/components/EmptyState";
import { ErrorState } from "../../src/components/ErrorState";
import { LoadingState } from "../../src/components/LoadingState";
import { Avatar } from "../../src/components/Avatar";
import { RiskBadge } from "../../src/components/RiskBadge";
import { relativeTime } from "../../src/format/activity";
import { Icon } from "../../src/components/Icon";
import { TriageDigestBar } from "../../src/components/TriageDigestBar";
import { triggerAndroidHaptic } from "../../src/platform/android";
import { detectAgentProvenance } from "../../src/workspace/provenance";
import { getExecutiveVerdict } from "../../src/workspace/executiveVerdict";

export default function TriageScreen() {
  const router=useRouter();
  const lock=useRef(false);
  const [saving,setSaving]=useState(false);
  const { colors, typography, spacing, radius } = useTheme();

  const [inbox,setInbox]=useState<Notification[]>([]);
  const [metadata,setMetadata]=useState<{ref:string;detail?:PrDetail;failed?:boolean}|null>(null);
  const [queue, setQueue] = useState<TriageItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<TriageItem[]>([]);

  const loadQueue = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [items,notifications] = await Promise.all([api.getTriageQueue(),api.getNotifications("all").catch(()=>[])]);
      setInbox(notifications);
      setQueue(items);
      setUndoStack([]);
    } catch (e) {
      setError(toUserMessage(e, "We couldn't load your triage deck right now. Please try again."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  const handleDecision = async (lane: TriageLane) => {
    if (queue.length === 0 || lock.current) return;
    triggerAndroidHaptic();
    lock.current=true;setSaving(true);
    const current = queue[0];
    try {
      await api.setTriageChoice(current.prRef, lane);
      setUndoStack((prev) => [current, ...prev]);
      setQueue((prev) => prev.slice(1));
    } catch (e) {

      setError(toUserMessage(e, "Couldn't save your choice."));
    } finally {lock.current=false;setSaving(false);}
  };

  const handleUndo = async () => {
    if(!undoStack.length || lock.current)return;
    lock.current=true;setSaving(true);
    const [last,...rest]=undoStack;
    try { await api.undoTriageChoice(last.prRef); setQueue(prev=>[last,...prev]);setUndoStack(rest); }
    catch(e){setError(toUserMessage(e,"Couldn't undo that choice."));}
    finally{lock.current=false;setSaving(false);}
  };

  const currentItem = queue[0];
  const decisionRef = useRef(handleDecision);
  decisionRef.current = handleDecision;
  const undoActionRef = useRef(handleUndo);
  undoActionRef.current = handleUndo;

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (e.key === "1" || e.key === "ArrowLeft") {
        e.preventDefault();
        void decisionRef.current("ignore");
      } else if (e.key === "2" || e.key === "ArrowDown") {
        e.preventDefault();
        void decisionRef.current("fyi");
      } else if (e.key === "3" || e.key === "ArrowRight") {
        e.preventDefault();
        void decisionRef.current("needs_you");
      } else if (e.key.toLowerCase() === "z" || e.key.toLowerCase() === "u") {
        e.preventDefault();
        void undoActionRef.current();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(()=>{
    if(!currentItem)return;
    let active=true;
    const [fullRepo,number]=currentItem.prRef.split('#');
    const [owner,repo]=fullRepo.split('/');
    api.getPrMetadata(owner,repo,Number(number)).then(detail=>{
      if(active)setMetadata({ref:currentItem.prRef,detail});
    }).catch(()=>{if(active)setMetadata({ref:currentItem.prRef,failed:true});});
    return ()=>{active=false;};
  },[currentItem?.prRef]);
  const detail=metadata?.ref===currentItem?.prRef?metadata?.detail:undefined;
  const notification=inbox.find(item=>`${item.repo}#${item.number}`===currentItem?.prRef);
  const author=detail?.author ?? currentItem?.author ?? notification?.author;
  const risk=notification?.risk;
  const checks=detail?.checks ?? [];
  const ciFailed=checks.some(check=>check.conclusion==='failure');
  const ciPassed=checks.length>0 && checks.every(check=>check.conclusion==='success');
  const ciLabel=!detail?'CI unavailable':checks.length===0?'No checks':ciPassed?'All CI green':ciFailed?'CI failed':'CI pending';
  const total = queue.length + undoStack.length;
  const processedCount = undoStack.length;
  const progressPercent = total > 0 ? (processedCount / total) * 100 : 100;

  const provenance = detectAgentProvenance({
    author,
    headBranch: detail?.headBranch,
    title: currentItem?.title ?? detail?.title,
  });
  const verdict = getExecutiveVerdict({
    risk: detail?.risk ?? (risk ? { level: risk, reasons: [currentItem.reason], coverage: { analyzedFiles: 1, skippedFiles: 0, truncatedFiles: 0 } } : undefined),
    files: detail?.files,
    checks: detail?.checks,
    secretWarning: detail?.secretWarning,
    changedFilesCount: detail?.changedFilesCount,
  });

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Header
        title="Triage Deck"
        rightAction={<View style={{flexDirection:"row",alignItems:"center",gap:12}}><Text style={[typography.code,{color:colors.textSecondary,fontSize:11}]}>{processedCount} of {total}</Text>{undoStack.length>0 && <TouchableOpacity disabled={saving} onPress={handleUndo} style={styles.undoBtn} accessibilityRole="button" accessibilityLabel="Undo last triage choice"><Icon name="arrow-undo-outline" size={20} color={colors.brandLight}/></TouchableOpacity>}</View>}
        footer={<View style={{paddingHorizontal:16,paddingBottom:8}}><View style={[styles.progressTrack,{backgroundColor:colors.surfaceElevated}]} accessibilityRole="progressbar" accessibilityLabel="Triage progress" accessibilityValue={{min:0,max:total||1,now:processedCount}}><View style={[styles.progressBar,{backgroundColor:colors.brand,width:`${progressPercent}%`}]}/></View></View>}
      />

      <ScrollView contentContainerStyle={{padding:16,paddingBottom:32,flexGrow:1}}>

        {isLoading ? <LoadingState title="Loading triage deck..." message="Sorting your pull requests by review priority."/> : error && !currentItem ? <ErrorState title="Could not load triage deck" message={error} onRetry={loadQueue}/> : !currentItem ? (
          <View style={{alignItems:"center",justifyContent:"center",paddingVertical:48,paddingHorizontal:24}}>
            <View style={{width:64,height:64,borderRadius:32,backgroundColor:colors.riskLowBg,alignItems:"center",justifyContent:"center",marginBottom:16}}>
              <Icon name="checkmark-done" size={32} color={colors.riskLow}/>
            </View>
            <Text style={[typography.title2,{color:colors.text,textAlign:"center",fontWeight:"700"}]}>
              All Caught Up!
            </Text>
            <Text style={[typography.body,{color:colors.textSecondary,textAlign:"center",marginTop:8,maxWidth:360}]}>
              {total > 0 ? `You've triaged all ${total} pull requests before stepping into the office.` : "No pull requests waiting to be triaged."}
            </Text>
            <View style={{flexDirection:"row",gap:12,marginTop:24}}>
              <TouchableOpacity onPress={()=>router.push("/(tabs)/inbox")} style={[styles.completionBtn,{backgroundColor:colors.brand,borderRadius:radius.md}]} accessibilityRole="button" accessibilityLabel="Open Inbox">
                <Text style={[typography.subhead,{color:"#FFFFFF",fontWeight:"600"}]}>View Inbox</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={loadQueue} style={[styles.completionBtn,{backgroundColor:colors.surfaceElevated,borderWidth:1,borderColor:colors.border,borderRadius:radius.md}]} accessibilityRole="button" accessibilityLabel="Reload Deck">
                <Text style={[typography.subhead,{color:colors.text,fontWeight:"600"}]}>Reload Deck</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={{marginTop:16}}>
            <TriageDigestBar queue={queue}/>
            {!!error && <Text accessibilityRole="alert" style={[typography.footnote,{color:colors.riskHigh}]}>{error}</Text>}
            <View style={{height:12,marginHorizontal:24,backgroundColor:colors.surfaceElevated,borderRadius:16}}/>
            <View style={{height:12,marginHorizontal:12,marginTop:-4,backgroundColor:colors.surfaceSecondary,borderRadius:16}}/>
            <TouchableOpacity style={styles.cardBtn} disabled={saving} onPress={()=>{const [fullRepo="owner/repo",num="1"]=currentItem.prRef.split("#");const [owner="owner",repo="repo"]=fullRepo.split("/");router.push(`/pr/${owner}/${repo}/${num}`);}} accessibilityRole="button" accessibilityLabel={`Open pull request ${currentItem.title ?? currentItem.prRef}`}><Section style={{padding:16}}>
              <View style={{flexDirection:"row",gap:8,alignItems:"center",justifyContent:"space-between",flexWrap:"wrap"}}>
                <Text style={[typography.code,{color:colors.textSecondary,fontSize:11}]}>{currentItem.prRef}</Text>
                <View style={{flexDirection:"row",alignItems:"center",gap:6}}>
                  {provenance.isAgentAuthored && (
                    <View style={{flexDirection:"row",alignItems:"center",gap:4,backgroundColor:colors.brandSubtle,paddingHorizontal:8,paddingVertical:2,borderRadius:radius.full}}>
                      <Icon name="hardware-chip-outline" size={11} color={colors.brandLight}/>
                      <Text style={[typography.caption,{color:colors.brandLight,fontSize:11,fontWeight:"600"}]}>{provenance.agentName}</Text>
                    </View>
                  )}
                  <View style={{flexDirection:"row",alignItems:"center",gap:4,backgroundColor:verdict.tone==="green"?colors.riskLowBg:verdict.tone==="yellow"?colors.riskMediumBg:colors.riskHighBg,paddingHorizontal:8,paddingVertical:2,borderRadius:radius.full}}>
                    <Icon name={verdict.iconName} size={11} color={verdict.tone==="green"?colors.riskLow:verdict.tone==="yellow"?colors.riskMedium:colors.riskHigh}/>
                    <Text style={[typography.caption,{color:verdict.tone==="green"?colors.riskLow:verdict.tone==="yellow"?colors.riskMedium:colors.riskHigh,fontSize:11,fontWeight:"700"}]}>{verdict.headline.split("·")[0].trim()}</Text>
                  </View>
                </View>
              </View>
              <Text accessibilityRole="header" style={[typography.title2,{color:colors.text,marginTop:8}]}>{currentItem.title ?? detail?.title ?? currentItem.prRef}</Text>
              <View style={{flexDirection:"row",alignItems:"center",gap:8,marginTop:16}}><Avatar login={author ?? '?'} size={24}/><Text style={[typography.footnote,{color:colors.textSecondary,flex:1}]}>{author ?? 'Author unavailable'}</Text><Text style={[typography.caption,{color:colors.textSecondary}]}>{detail?relativeTime(detail.updatedAt):notification?relativeTime(notification.updatedAt):'Time unavailable'}</Text></View>
              <View style={{backgroundColor:colors.brandSubtle,padding:16,borderRadius:12,marginTop:16}}>
                <View style={{flexDirection:"row",gap:8,alignItems:"center",marginBottom:8}}><Icon name="sparkles" size={16} color={colors.brandLight}/><Text style={[typography.caption,{color:colors.brandLight}]}>AI TRIAGE INSIGHT</Text></View>
                <Text style={[typography.body,{color:colors.text}]}>{currentItem.reason}</Text>
              </View>
              <View style={{flexDirection:"row",alignItems:"center",gap:8,flexWrap:"wrap",marginTop:16}}>
                {detail?<><Text style={[typography.code,{color:colors.riskLow,fontSize:11}]}>+{detail.additions}</Text><Text style={[typography.code,{color:colors.riskHigh,fontSize:11}]}>-{detail.deletions}</Text><Text style={[typography.code,{color:colors.textSecondary,fontSize:11}]}>{detail.changedFilesCount} files</Text></>:<Text style={[typography.caption,{color:colors.textSecondary}]}>{metadata?.ref===currentItem.prRef && metadata.failed?'Diff unavailable':'Loading details…'}</Text>}
                <View style={{flexDirection:"row",alignItems:"center",gap:4,backgroundColor:ciPassed?colors.riskLowBg:ciFailed?colors.riskHighBg:colors.surfaceElevated,borderRadius:9999,paddingHorizontal:8,paddingVertical:4,marginLeft:"auto"}}><Icon name={ciPassed?'checkmark-circle-outline':ciFailed?'close-circle-outline':'time-outline'} size={14} color={ciPassed?colors.riskLow:ciFailed?colors.riskHigh:colors.textSecondary}/><Text style={[typography.caption,{color:ciPassed?colors.riskLow:ciFailed?colors.riskHigh:colors.textSecondary}]}>{ciLabel}</Text></View>
              </View>
            </Section></TouchableOpacity>
            <View style={{flexDirection:"row",justifyContent:"space-around",gap:12,marginTop:28}}>
              {([{lane:"ignore",label:"Ignore",icon:"close",color:colors.textSecondary},{lane:"fyi",label:"FYI · Later",icon:"time-outline",color:colors.riskMedium},{lane:"needs_you",label:"Needs you",icon:"flash",color:colors.brandLight}] as const).map(action=><TouchableOpacity key={action.lane} disabled={saving} accessibilityState={{disabled:saving,busy:saving}} onPress={()=>handleDecision(action.lane)} accessibilityRole="button" accessibilityLabel={action.label} style={{alignItems:"center",gap:10,minWidth:80,minHeight:84}}><View style={{width:56,height:56,borderRadius:28,backgroundColor:colors.surfaceElevated,borderWidth:1,borderColor:colors.border,alignItems:"center",justifyContent:"center"}}><Icon name={action.icon} size={24} color={action.color}/></View><Text style={[typography.caption,{color:action.color}]}>{action.label}</Text></TouchableOpacity>)}
            </View>
            <Text style={[typography.footnote,{color:colors.textSecondary,textAlign:"center",marginTop:16}]}>Your choices organize MergeMate. They never change the pull request on GitHub.</Text>
            <Text style={[typography.caption,{color:colors.textMuted,textAlign:"center",marginTop:10}]}>Desktop hotkeys: 1 Ignore · 2 FYI · 3 Needs you · Z Undo</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles=StyleSheet.create({
  root:{flex:1},undoBtn:{minHeight:44,minWidth:44,alignItems:'center',justifyContent:'center'},
  cardBtn:{minHeight:44,minWidth:44},
  completionBtn:{minHeight:44,minWidth:44,paddingHorizontal:20,paddingVertical:12,alignItems:'center',justifyContent:'center'},
  progressTrack:{height:4,width:'100%',borderRadius:4,overflow:'hidden'},progressBar:{height:'100%'},
});
