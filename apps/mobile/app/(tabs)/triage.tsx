import React, { useState, useEffect, useCallback } from "react";
import { View, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { Text } from "../../src/components/Text";
import { useTheme } from "../../src/context/ThemeContext";
import { api } from "../../src/api";
import { toUserMessage } from "../../src/api/errors";
import { TriageItem, TriageLane } from "../../src/types";
import { Header } from "../../src/components/Header";
import { ScreenIntro, Section } from "../../src/components/ScreenDesign";
import { EmptyState } from "../../src/components/EmptyState";
import { ErrorState } from "../../src/components/ErrorState";
import { LoadingState } from "../../src/components/LoadingState";
import { Icon } from "../../src/components/Icon";

export default function TriageScreen() {
  const { colors, typography, spacing, radius } = useTheme();

  const [queue, setQueue] = useState<TriageItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<TriageItem[]>([]);

  const loadQueue = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const items = await api.getTriageQueue();
      setQueue(items);
      setTotalCount(items.length);
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
    if (queue.length === 0) return;
    const current = queue[0];
    setUndoStack((prev) => [current, ...prev]);
    setQueue((prev) => prev.slice(1));
    try {
      await api.setTriageChoice(current.prRef, lane);
    } catch (e) {
      // Put the card back and say why.
      setUndoStack((prev) => prev.slice(1));
      setQueue((prev) => [current, ...prev]);
      setError(toUserMessage(e, "Couldn't save your choice."));
    }
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const [last, ...rest] = undoStack;
    setQueue((prev) => [last, ...prev]);
    setUndoStack(rest);
  };

  const currentItem = queue[0];
  const processedCount = totalCount - queue.length;
  const progressPercent = totalCount > 0 ? (processedCount / totalCount) * 100 : 100;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Header
        title="Triage Deck"
        rightAction={
          undoStack.length > 0 ? (
            <TouchableOpacity
              onPress={handleUndo}
              style={styles.undoBtn}
              accessibilityRole="button"
              accessibilityLabel="Undo last triage choice"
            >
              <Text style={[typography.subhead, { color: colors.brandLight, fontWeight: "600" }]}>Undo</Text>
            </TouchableOpacity>
          ) : undefined
        }
      />

      <ScrollView contentContainerStyle={{padding:16,paddingBottom:32,flexGrow:1}}>
        <ScreenIntro eyebrow="One pull request at a time" title="Triage Deck" description="Focus on what needs you. Sort the rest for later." icon="layers-outline"/>
        <View style={{flexDirection:"row",justifyContent:"space-between",marginVertical:12}}>
          <Text style={[typography.code,{color:colors.textSecondary}]}>{processedCount} of {totalCount} reviewed</Text>
          <Text style={[typography.caption,{color:colors.brandLight}]}>{queue.length} remaining</Text>
        </View>
        <View style={[styles.progressTrack,{backgroundColor:colors.surfaceElevated}]} accessibilityRole="progressbar" accessibilityValue={{min:0,max:totalCount||1,now:processedCount}}>
          <View style={[styles.progressBar,{backgroundColor:colors.brand,width:`${progressPercent}%`}]} />
        </View>
        {isLoading ? <LoadingState title="Loading triage deck..." message="Sorting your pull requests by review priority."/> : error ? <ErrorState title="Could not load triage deck" message={error} onRetry={loadQueue}/> : !currentItem ? <EmptyState icon="checkmark-done-outline" title="All Caught Up!" message={`You've sorted all ${totalCount} pull requests.`} actionTitle="Reload Deck" onAction={loadQueue}/> : (
          <View style={{marginTop:32}}>
            <View style={{height:12,marginHorizontal:24,backgroundColor:colors.surfaceElevated,borderRadius:16}}/>
            <View style={{height:12,marginHorizontal:12,marginTop:-4,backgroundColor:colors.surfaceSecondary,borderRadius:16}}/>
            <Section style={{padding:24}}>
              <View style={{flexDirection:"row",gap:8,alignItems:"center",flexWrap:"wrap"}}><Icon name="git-pull-request-outline" size={18} color={colors.brandLight}/><Text style={[typography.code,{color:colors.textSecondary,flexShrink:1}]}>{currentItem.prRef}</Text></View>
              <Text accessibilityRole="header" style={[typography.title2,{color:colors.text,marginTop:20}]}>{currentItem.title ?? currentItem.prRef}</Text>
              <View style={{backgroundColor:colors.brandSubtle,padding:16,borderRadius:12,marginTop:24}}>
                <View style={{flexDirection:"row",gap:8,alignItems:"center",marginBottom:8}}><Icon name="sparkles" size={16} color={colors.brandLight}/><Text style={[typography.caption,{color:colors.brandLight}]}>AI TRIAGE INSIGHT</Text></View>
                <Text style={[typography.body,{color:colors.text}]}>{currentItem.reason}</Text>
              </View>
              <View style={{flexDirection:"row",gap:8,alignItems:"center",marginTop:20}}><Icon name="pricetag-outline" size={16} color={colors.textSecondary}/><Text style={[typography.footnote,{color:colors.textSecondary}]}>Suggested: {currentItem.lane.replace("_"," ")}</Text></View>
            </Section>
            <View style={{flexDirection:"row",justifyContent:"space-around",gap:12,marginTop:28}}>
              {([{lane:"ignore",label:"Ignore",icon:"close",color:colors.textSecondary},{lane:"fyi",label:"FYI · Later",icon:"time-outline",color:colors.riskMedium},{lane:"needs_you",label:"Needs you",icon:"flash",color:colors.brandLight}] as const).map(action=><TouchableOpacity key={action.lane} onPress={()=>handleDecision(action.lane)} accessibilityRole="button" accessibilityLabel={action.label} style={{alignItems:"center",gap:10,minWidth:80,minHeight:84}}><View style={{width:56,height:56,borderRadius:28,backgroundColor:colors.surfaceElevated,borderWidth:1,borderColor:colors.border,alignItems:"center",justifyContent:"center"}}><Icon name={action.icon} size={24} color={action.color}/></View><Text style={[typography.caption,{color:action.color}]}>{action.label}</Text></TouchableOpacity>)}
            </View>
            <Text style={[typography.footnote,{color:colors.textSecondary,textAlign:"center",marginTop:24}]}>Your choices organize MergeMate. They never change the pull request on GitHub.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  reasonRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  reasonIcon: {
    marginTop: 1,
  },
  root: {
    flex: 1,
  },
  undoBtn: {
    minHeight: 44,
    minWidth: 52,
    paddingHorizontal: 8,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  progressTrack: {
    height: 4,
    width: "100%",
  },
  progressBar: {
    height: "100%",
  },
  content: {
    flex: 1,
  },
  deckContainer: {
    flex: 1,
  },
  triageCard: {
    padding: 20,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  lanePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  reasonBox: {
    padding: 12,
  },
  actions: {
    width: "100%",
  },
});
