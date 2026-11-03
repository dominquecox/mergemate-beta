import { InboxOverview } from "../../src/components/InboxOverview";
import { InfoTip } from "../../src/components/InfoTip";
import { AccessGuidanceBanner } from "../../src/components/AccessGuidanceBanner";
import { useAlerts } from "../../src/context/AlertsContext";
import * as Crypto from "expo-crypto";
import type {InboxReceipt} from "@mergemate/contracts";
import {useAuth} from "../../src/context/AuthContext";
import {ApiClientError} from "../../src/api/errors";
import {Button} from "../../src/components/Button";
import {useFeatureFlags} from "../../src/hooks/useFeatureFlags";
import {ReadoutControls} from "../../src/components/ReadoutControls";
import {inboxNarration} from "../../src/readout/text";
import React, { useState, useRef,useEffect,useCallback } from "react";
import {AppState,Platform, View, FlatList, RefreshControl, TouchableOpacity, Pressable, StyleSheet } from "react-native";
import { androidRipple } from "../../src/platform/android";
import { Text } from "../../src/components/Text";
import { useRouter,useFocusEffect } from "expo-router";
import { useTheme } from "../../src/context/ThemeContext";
import { api } from "../../src/api";
import { toUserMessage } from "../../src/api/errors";
import { Notification, NotificationFilter } from "../../src/types";
import { Header } from "../../src/components/Header";
import { Avatar } from "../../src/components/Avatar";
import { RiskBadge } from "../../src/components/RiskBadge";
import { StatusPill } from "../../src/components/StatusPill";
import { EmptyState } from "../../src/components/EmptyState";
import { ErrorState } from "../../src/components/ErrorState";
import { LoadingState } from "../../src/components/LoadingState";
import { Icon } from "../../src/components/Icon";
import { useLayout } from "../../src/layout/useLayout";

import { usePagedList } from "../../src/hooks/usePagedList";
import { groupByRepo, type InboxRow } from "../../src/workspace/inboxGroups";

export default function InboxScreen(){const {user}=useAuth();return user?<InboxBootstrap key={user.id}/>:<LoadingState title="Loading your inbox..." message="Checking your account."/>;}
function InboxBootstrap(){
 const [initial,setInitial]=useState<NotificationFilter|null>(null),[error,setError]=useState(false);const mounted=useRef(true);
 const load=async()=>{setError(false);try{const saved=await api.getInboxPreference();if(mounted.current)setInitial(saved.filter);}catch{if(mounted.current)setError(true);}};
 useEffect(()=>{void load();return()=>{mounted.current=false;};},[]);
 if(initial!==null)return <InboxWorkspace initialFilter={initial}/>;
 if(error)return <View style={{flex:1}}><Header title="Inbox"/><ErrorState title="Could not load your Inbox preference" message="Retry, or use All temporarily without changing your saved filter." onRetry={load}/><Button title="Use All temporarily" variant="secondary" onPress={()=>setInitial('all')}/></View>;
 return <LoadingState title="Loading your inbox..." message="Restoring your saved filter."/>;
}
function InboxWorkspace({initialFilter}:{initialFilter:NotificationFilter}) {
  const router = useRouter();
  const flags=useFeatureFlags();
  const { colors, typography, spacing, radius } = useTheme();
  const { isDesktop } = useLayout();

  const {isDemo,user}=useAuth();
  const { syncItems } = useAlerts();
  const [filter,setFilter]=useState<NotificationFilter>(initialFilter),[prefError,setPrefError]=useState(false),[prefSaving,setPrefSaving]=useState(false),[prefMessage,setPrefMessage]=useState("");
  const preferenceQueue=useRef(Promise.resolve()),view=useRef(0),currentFilter=useRef(filter);currentFilter.current=filter;
  const {items:sourceItems,setItems,loading:isLoading,busy:isRefreshing,error,setError,refresh:fetchItems,revalidate,more,hasMore,refreshAfterMs}=usePagedList(`inbox:${user?.id}:${filter}`,cursor=>api.getNotificationPage(filter,cursor),()=>api.invalidateInbox());
  type Hidden={revision:string;until?:number};
  const [hidden,setHidden]=useState<Record<string,Hidden>>({}),[wakeAt,setWakeAt]=useState<number|null>(null);
  const [undoItem,setUndoItem]=useState<{item?:Notification;receipt:InboxReceipt;itemId:string}|null>(null),[acting,setActing]=useState(false);
  const actionLock=useRef(false),undoGeneration=useRef(0),retryActions=useRef(new Map<string,{key:string;operationId:string}>()),undoRetry=useRef<{expected:string;id:string}|null>(null);
  useEffect(()=>{const version=view.current,generation=undoGeneration.current;api.getInboxUndo().then(saved=>{if(version===view.current&&generation===undoGeneration.current&&saved)setUndoItem(saved);},()=>{});},[]);
  const items=sourceItems.filter(item=>{const removed=hidden[item.id];return !removed||Date.parse(item.updatedAt)>Date.parse(removed.revision)||(removed.until!==undefined&&removed.until<=Date.now());}).sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt)||(a.id<b.id?-1:a.id>b.id?1:0));
  useEffect(()=>{if(filter==="all"&&sourceItems.length>0)syncItems(items);},[filter,items,sourceItems.length,syncItems]);
  const [grouped,setGrouped]=useState(false);
  const rows:InboxRow[]=grouped?groupByRepo(items):items.map(item=>({type:"item",item}));
  const persist=(next:NotificationFilter)=>{
    if(isDemo)return;setPrefSaving(true);setPrefMessage("");const version=view.current;
    preferenceQueue.current=preferenceQueue.current.catch(()=>{}).then(async()=>{if(version!==view.current)return;try{await api.setInboxPreference(next);if(version===view.current){setPrefError(false);setPrefMessage("Filter saved for next time.");}}catch{if(version===view.current)setPrefError(true);}finally{if(version===view.current)setPrefSaving(false);}});
  };
  const selectFilter=(next:NotificationFilter)=>{if(next===filter)return;view.current++;undoGeneration.current++;actionLock.current=false;setActing(false);setUndoItem(null);setFilter(next);persist(next);};
  const listRef=useRef<FlatList<InboxRow>>(null),scrollOffset=useRef(0),listActive=useRef(false);
  const focused=useRef(false);
  useFocusEffect(useCallback(()=>{
    let active=true;listActive.current=true;
    // A hidden web list can keep its offset while its virtual window resets.
    // Re-emit the restored scroll so Back renders the rows at that offset.
    const restore=requestAnimationFrame(()=>{listRef.current?.recordInteraction();listRef.current?.scrollToOffset({offset:scrollOffset.current,animated:false});const node:unknown=listRef.current?.getScrollableNode();if(Platform.OS==='web'&&typeof HTMLElement!=='undefined'&&node instanceof HTMLElement)node.dispatchEvent(new Event('scroll'));});
    if(focused.current){api.invalidateInbox();void revalidate();}focused.current=true;
    const refresh=()=>{if(active&&AppState.currentState==='active'){api.invalidateInbox();void revalidate();}};
    const interval=setInterval(refresh,60000),state=AppState.addEventListener('change',value=>{if(value==='active')refresh();});
    return()=>{active=false;listActive.current=false;cancelAnimationFrame(restore);clearInterval(interval);state.remove();};
  },[revalidate]));
  useEffect(()=>{const wait=Math.min(refreshAfterMs??Infinity,wakeAt===null?Infinity:Math.max(0,wakeAt-Date.now()));if(!Number.isFinite(wait))return;const timer=setTimeout(()=>{setWakeAt(null);if(AppState.currentState==='active'){api.invalidateInbox();void revalidate();}},Math.min(2147483647,Math.max(250,wait)));return()=>clearTimeout(timer);},[refreshAfterMs,wakeAt,revalidate]);
  useEffect(()=>()=>{view.current++;},[]);
  const onRefresh=()=>{api.invalidateInbox();void fetchItems();};
  const applyAction=async(item:Notification,action:'done'|'snooze')=>{
    if(isDemo||actionLock.current)return;actionLock.current=true;setActing(true);setError(null);const version=view.current;const key=JSON.stringify([action,item.updatedAt,item.stateToken??null]);const prior=retryActions.current.get(item.id);const operationId=prior?.key===key?prior.operationId:Crypto.randomUUID();retryActions.current.set(item.id,{key,operationId});undoGeneration.current++;
    setHidden(old=>({...old,[item.id]:{revision:item.updatedAt}}));setUndoItem(null);
    try{
      const receipt=await api.mutateInboxItem(item.id,{operationId,expectedOperationId:item.stateToken??null,action,observedUpdatedAt:item.updatedAt,...(action==='snooze'?{durationMinutes:1440}:{})});
      if(version!==view.current)return;
      setItems(old=>old.map(row=>row.id===item.id?{...row,stateToken:receipt.operationId}:row));
      const until=receipt.snoozedUntil?Date.now()+Math.max(0,Date.parse(receipt.snoozedUntil)-Date.parse(receipt.updatedAt)):null;
      if(until!==null)setWakeAt(until);
      setHidden(old=>({...old,[item.id]:{revision:item.updatedAt,...(until!==null?{until}:{})}}));retryActions.current.delete(item.id);setUndoItem({item,itemId:item.id,receipt});
    }catch(error){if(version===view.current){setHidden(old=>{const next={...old};delete next[item.id];return next;});setError(toUserMessage(error,"Couldn't update this item. Try again."));if(error instanceof ApiClientError&&error.code==='state_conflict'){api.invalidateInbox();void revalidate();}}}
    finally{if(version===view.current){actionLock.current=false;setActing(false);}}
  };
  const handleDone=(item:Notification)=>applyAction(item,'done'),handleSnooze=(item:Notification)=>applyAction(item,'snooze');
  const handleUndo=async()=>{
    if(!undoItem||actionLock.current||isDemo)return;actionLock.current=true;setActing(true);setError(null);const version=view.current;const {item,itemId,receipt}=undoItem;undoGeneration.current++;
    const operationId=undoRetry.current?.expected===receipt.operationId?undoRetry.current.id:Crypto.randomUUID();undoRetry.current={expected:receipt.operationId,id:operationId};
    try{
      const restored=await api.mutateInboxItem(itemId,{operationId,expectedOperationId:receipt.operationId,action:'restore',observedUpdatedAt:item?.updatedAt??receipt.updatedAt});
      if(version!==view.current)return;
      setHidden(old=>{const next={...old};delete next[itemId];return next;});
      if(item)setItems(old=>old.some(row=>row.id===itemId)?old.map(row=>row.id===itemId?{...row,stateToken:restored.operationId}:row):[...old,{...item,stateToken:restored.operationId}]);
      else{api.invalidateInbox();void revalidate();}
      undoRetry.current=null;setUndoItem(null);
    }catch(error){if(version===view.current){setError(toUserMessage(error,"Couldn't undo this change. Try Undo again."));if(error instanceof ApiClientError&&error.code==='state_conflict'){setUndoItem(null);api.invalidateInbox();void revalidate();}}}
    finally{if(version===view.current){actionLock.current=false;setActing(false);}}
  };

  const tabNodes=useRef(new Map<string,HTMLElement>()),chooseTab=useRef(selectFilter);chooseTab.current=selectFilter;
  // Header tabs mount after the paged list loads, so bind to their actual DOM lifetime.
  const bindFilterTab=(tab:NotificationFilter,node:unknown,selected:boolean)=>{
    const old=tabNodes.current.get(tab);
    if(old){old.onkeydown=null;tabNodes.current.delete(tab);}
    if(Platform.OS!=='web'||typeof HTMLElement==='undefined'||!(node instanceof HTMLElement))return;
    node.tabIndex=selected?0:-1;
    const tabs:NotificationFilter[]=['all','review','mentions','mine'],index=tabs.indexOf(tab);
    node.onkeydown=(event:KeyboardEvent)=>{
      let next=index;
      if(event.key==='ArrowRight')next=(index+1)%4;
      else if(event.key==='ArrowLeft')next=(index+3)%4;
      else if(event.key==='Home')next=0;
      else if(event.key==='End')next=3;
      else return;
      event.preventDefault();const value=tabs[next];
      if(value){chooseTab.current(value);tabNodes.current.get(value)?.focus();}
    };
    tabNodes.current.set(tab,node);
  };
  useEffect(()=>()=>{for(const node of tabNodes.current.values())node.onkeydown=null;tabNodes.current.clear();},[]);

  const navigateToPr = (item: Notification) => {
    const parts = item.repo.split("/");
    const owner = parts[0] || "owner";
    const repoName = parts[1] || "repo";
    router.push(`/pr/${owner}/${repoName}/${item.number}`);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Header
        title="Inbox"
        rightAction={
          <View style={styles.headerIcons}>
            <TouchableOpacity onPress={() => router.push("/workflows")} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="Review playbooks"><Icon name="git-network-outline" size={22} color={colors.brandLight}/></TouchableOpacity>
            <TouchableOpacity
              onPress={onRefresh}
              disabled={isRefreshing}
              style={[styles.iconBtn,isRefreshing&&{opacity:0.5}]}
              accessibilityRole="button"
              accessibilityLabel="Refresh Inbox"
            >
              <Icon name="refresh-outline" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
            {!isDesktop && <TouchableOpacity
              onPress={() => router.push("/search")}
              style={styles.iconBtn}
              accessibilityRole="button"
              accessibilityLabel="Search pull requests"
            >
              <Icon name="search-outline" size={22} color={colors.textSecondary} />
            </TouchableOpacity>}
            {flags.highlight && <TouchableOpacity
              onPress={() => router.push("/highlight")}
              style={styles.iconBtn}
              accessibilityRole="button"
              accessibilityLabel="Highlight screenshot"
            >
              <Icon name="camera-outline" size={22} color={colors.textSecondary} />
            </TouchableOpacity>}
          </View>
        }
      />


      {(prefSaving||Boolean(prefMessage&&prefMessage!=="Filter saved for next time."))&&<Text accessibilityLiveRegion="polite" style={[typography.caption,{color:colors.textSecondary,paddingHorizontal:16}]}>{prefSaving?"Saving filter…":prefMessage}</Text>}
      {prefError&&<View style={{padding:12}}><Text style={[typography.body,{color:colors.textSecondary}]} accessibilityRole="alert">This filter applies here, but could not be saved for next time.</Text><Button title="Retry saving filter" variant="ghost" onPress={()=>persist(filter)}/></View>}
      {acting&&<Text accessibilityLiveRegion="polite" style={[typography.body,{color:colors.textSecondary,padding:12}]}>Saving Inbox change…</Text>}
      {error&&sourceItems.length>0&&<View style={{padding:12}}><Text accessibilityRole="alert" style={[typography.body,{color:colors.riskHigh}]}>{error}</Text></View>}
      {/* Undo Toast */}
      {undoItem && (
        <View
          style={[styles.undoToast, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
          accessibilityLiveRegion="polite"
        >
          <Text style={[typography.footnote, { color: colors.text }]}>Inbox change saved</Text>
          <TouchableOpacity
            disabled={acting} onPress={handleUndo}
            style={styles.undoBtn}
            accessibilityRole="button"
            accessibilityLabel={undoItem.item?`Undo moving ${undoItem.item.title}`:"Undo last Inbox change"}
          >
            <Text style={[typography.footnote, { color: colors.brandLight, fontWeight: "700" }]}>Undo</Text>
          </TouchableOpacity>
        </View>
      )}

        <FlatList
          ref={listRef}
          onScroll={event=>{if(listActive.current)scrollOffset.current=event.nativeEvent.contentOffset.y;}} scrollEventThrottle={16}
          key={`${isDesktop?'desktop':'phone'}:${grouped?'grouped':'flat'}`} numColumns={isDesktop&&!grouped?2:1} columnWrapperStyle={isDesktop&&!grouped?{gap:16}:undefined}
          data={isLoading?[]:rows}
          ListEmptyComponent={isLoading?<LoadingState title="Loading your inbox..." message="Fetching accessible pull requests and your Inbox state."/>:error?<ErrorState title="Could not load your inbox" message={error} onRetry={hasMore?more:fetchItems}/>:<EmptyState icon="checkmark-done-outline" title={hasMore?"More results are available":"Inbox Zero"} message={hasMore?"No visible items on this page. Load more to continue checking your queue.":"No pull requests need your attention in this view."} actionTitle={hasMore?"Load more pull requests":undefined} onAction={hasMore?more:undefined}/>}
          keyExtractor={row=>row.type==='header'?`repo:${row.repo}`:row.item.id} initialNumToRender={8} maxToRenderPerBatch={8} windowSize={5}
          contentContainerStyle={{padding:isDesktop?24:spacing.base,paddingBottom:80}}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.brandLight}/>}
          onEndReached={()=>{if(!error)void more();}} onEndReachedThreshold={0.4}
          ListHeaderComponent={<>
          <InboxOverview count={items.length} needsReview={items.filter(item=>item.kind==="review").length} items={items}/>
      <AccessGuidanceBanner error={error} compact />
      <ReadoutControls label="Inbox overview" sentences={inboxNarration(items)}/>

      {/* Sleek Compact Control Toolbar: Section Header + Segmented Filter + Repo Grouping + Live Counts */}
      <View style={{ flexDirection: isDesktop ? "row" : "column", alignItems: isDesktop ? "center" : "stretch", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Text accessibilityRole="header" style={[typography.subhead, { color: colors.text, fontWeight: "700", fontSize: 13 }]}>
            Upcoming & Active Reviews
          </Text>
          <InfoTip
            title="Upcoming & Active Reviews"
            body="Filter your queue by All activity, Review requests, @Mentions, or your own PRs. Use Snooze (24h) or Done to keep your workspace clean without altering GitHub state."
            size={14}
          />
        </View>
        {!isDesktop && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open all workflows"
            onPress={() => router.push("/workflows")}
            style={{ flexDirection: "row", alignItems: "center", gap: 3, minHeight: 28, paddingHorizontal: 4 }}
          >
            <Text style={[typography.caption, { color: colors.brandLight, fontWeight: "700", fontSize: 11 }]}>Workflows →</Text>
          </Pressable>
        )}
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap", flex: isDesktop ? 1 : undefined, justifyContent: isDesktop ? "flex-end" : "space-between" }}>
        <View style={[styles.filterBar, { flex: isDesktop ? undefined : 1, minWidth: isDesktop ? 260 : 210, borderBottomWidth: 0, paddingHorizontal: 3, paddingVertical: 2, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.sm }]} accessibilityRole="tablist">
          {(["all", "review", "mentions", "mine"] as NotificationFilter[]).map((tab) => {
            const isSelected = filter === tab;
            let label = "All";
            if (tab === "review") label = "Review";
            if (tab === "mentions") label = "Mentions";
            if (tab === "mine") label = "Mine";

            return (
              <TouchableOpacity
                key={tab}
                ref={node=>bindFilterTab(tab,node,isSelected)}
                aria-selected={isSelected}
                onPress={() => selectFilter(tab)}
                style={[
                  styles.filterTab,
                  {
                    backgroundColor: isSelected ? colors.brandSubtle : "transparent",
                    borderRadius: 6,
                  },
                ]}
                accessibilityRole="tab"
                accessibilityLabel={tab === "review" ? "Needs review pull requests" : `${label} pull requests`}
                accessibilityState={{ selected: isSelected }}
              >
                <Text numberOfLines={1} ellipsizeMode="tail"
                  style={[
                    typography.caption,
                    {
                      fontSize: 11,
                      color: isSelected ? colors.brandLight : colors.textSecondary,
                      fontWeight: isSelected ? "700" : "500",
                    },
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity onPress={()=>setGrouped(value=>!value)} accessibilityRole="switch" accessibilityLabel="Group by repository" accessibilityState={{checked:grouped}} style={{flexDirection:'row',alignItems:'center',gap:5,minHeight:32,paddingHorizontal:10,paddingVertical:4,borderRadius:radius.sm,borderWidth:1,borderColor:grouped?colors.brandMuted:colors.border,backgroundColor:grouped?colors.brandSubtle:colors.surface}}><Icon name="folder-outline" size={13} color={grouped?colors.brandLight:colors.textSecondary}/><Text style={[typography.caption,{fontSize:11,color:grouped?colors.brandLight:colors.textSecondary,fontWeight:'600'}]}>{grouped?"Grouped":"Group by repo"}</Text></TouchableOpacity>

        {/* Compact Summary Strip */}
        <View
          style={[styles.summaryStrip, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.sm, paddingVertical: 4, paddingHorizontal: 10, marginBottom: 0, gap: 10 }]}
          accessibilityLabel={`Summary: ${items.filter((i) => i.kind === "review").length} needs you, ${items.filter((i) => i.kind === "mention").length} FYI, ${items.filter((i) => i.kind === "mine").length} mine`}
        >
          <View style={styles.stripCol}>
            <Text style={[typography.caption, { color: items.some((i) => i.kind === "review") ? colors.statusWarning : colors.statusGood, fontWeight: "700", fontSize: 12 }]}>
              {items.filter((i) => i.kind === "review").length}
            </Text>
            <Text style={[typography.caption, { color: colors.textSecondary, fontSize: 10 }]}>Needs you</Text>
          </View>
          <View style={styles.stripCol}>
            <Text style={[typography.caption, { color: colors.statusInfo, fontWeight: "700", fontSize: 12 }]}>
              {items.filter((i) => i.kind === "mention").length}
            </Text>
            <Text style={[typography.caption, { color: colors.textSecondary, fontSize: 10 }]}>FYI</Text>
          </View>
          <View style={styles.stripCol}>
            <Text style={[typography.caption, { color: colors.text, fontWeight: "700", fontSize: 12 }]}>
              {items.filter((i) => i.kind === "mine").length}
            </Text>
            <Text style={[typography.caption, { color: colors.textSecondary, fontSize: 10 }]}>Mine</Text>
          </View>
        </View>
      </View>
      </View>

</>}
          ListFooterComponent={hasMore || error?<TouchableOpacity disabled={isRefreshing} onPress={()=>void more()} accessibilityRole="button" style={{padding:16,minHeight:44}}><Text style={{color:colors.brandLight}}>{isRefreshing?'Loading…':error?'Retry loading pull requests':'Load more pull requests'}</Text></TouchableOpacity>:undefined}
          renderItem={({item:row})=>row.type==='header'?(<View testID={`inbox-repo-${row.repo}`} accessibilityRole="header" accessibilityLabel={`${row.repo}, ${row.count} pull request${row.count===1?'':'s'}`} style={{flexDirection:'row',alignItems:'center',gap:8,marginBottom:8,marginTop:4}}><Icon name="folder-outline" size={14} color={colors.brandLight}/><Text style={[typography.subhead,{color:colors.text,fontWeight:'700',flexShrink:1}]}>{row.repo}</Text><Text style={[typography.caption,{color:colors.textSecondary}]}>{row.count}</Text></View>):((item:Notification)=>(
              <View
                key={item.id}
                style={[
                  styles.itemCard,
                  isDesktop && {flex:1,maxWidth:"50%"},
                  { padding: 12, marginBottom: 10 },
                  {
                    backgroundColor: colors.surface,
                    borderColor: item.risk === "high" ? colors.statusAlert : colors.border,
                    borderRadius: 12,
                    borderLeftColor: item.risk === "high" ? colors.statusAlert : colors.brandMuted,
                    borderLeftWidth: item.risk === "high" ? 3 : 1,
                  },
                ]}
              >
                <Pressable
                  onPress={() => navigateToPr(item)}
                  android_ripple={androidRipple()}
                  style={({ pressed }) => [styles.cardMainTouch, pressed && { opacity: 0.85 }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Open pull request #${item.number}: ${item.title} in ${item.repo}, ${item.risk || "normal"} risk`}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}>
                      <Icon name="git-pull-request-outline" size={15} color={colors.brandLight} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={[styles.cardTop, { gap: 6 }]}>
                        <Text style={[typography.caption, { color: colors.textMuted, fontFamily: typography.code.fontFamily, flexShrink: 1, fontSize: 11 }]} numberOfLines={1}>
                          {item.repo} #{item.number}
                        </Text>
                        <View style={styles.badgeGroup}>
                          {item.status && <StatusPill status={item.status} />}
                          {item.risk && <RiskBadge level={item.risk} compact />}
                        </View>
                      </View>
                      <Text style={[typography.subhead, { color: colors.text, fontWeight: "600", marginTop: 2, fontSize: 13 }]} numberOfLines={1} ellipsizeMode="tail" accessibilityLabel={item.title}>
                        {item.title}
                      </Text>
                    </View>
                    <Icon name="chevron-forward" size={15} color={colors.textMuted} />
                  </View>

                  {!!item.summaryLine && (
                    <View style={[styles.summaryRow,{paddingHorizontal:8,paddingVertical:5,backgroundColor:colors.surfaceElevated,borderRadius:8,marginTop:6}]}>
                      <Icon name="sparkles" size={11} color={colors.brandLight} style={styles.summaryIcon} />
                      <Text style={[typography.caption, { color: colors.textSecondary, flex: 1, fontSize: 11 }]} numberOfLines={1}>
                        {item.summaryLine}
                      </Text>
                    </View>
                  )}
                </Pressable>

                <View style={[styles.cardBottom,{flexWrap:"wrap",gap:8,borderTopColor:colors.border,marginTop:6,paddingTop:6}]}>
                  <View style={{flexDirection:"row",alignItems:"center",gap:6,flex:1}}>
                    <Avatar login={item.author} size={15} />
                    <Text style={[typography.caption, { color: colors.textMuted, fontSize: 11 }]} numberOfLines={1}>
                      @{item.author} · {new Date(item.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </Text>
                  </View>

                  <View style={styles.quickActions}>
                    <TouchableOpacity
                      disabled={acting||isDemo} onPress={() => handleSnooze(item)}
                      style={[styles.actionBtn, { borderColor: colors.border, backgroundColor: colors.surfaceElevated, borderRadius: 6 }]}
                      accessibilityRole="button"
                      accessibilityLabel={`Snooze ${item.title}`}
                    >
                      <Text style={[typography.caption, { color: colors.textSecondary, fontWeight: "600", fontSize: 11 }]}>Snooze</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      disabled={acting||isDemo} onPress={() => handleDone(item)}
                      style={[styles.actionBtn, { borderColor: colors.statusGood, backgroundColor: colors.statusGoodBg, borderRadius: 6 }]}
                      accessibilityRole="button"
                      accessibilityLabel={`Mark ${item.title} as done`}
                    >
                      <Text style={[typography.caption, { color: colors.statusGood, fontWeight: "700", fontSize: 11 }]}>Done</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
))(row.item)}
        />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  headerIcons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  iconBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  filterBar: {
    flexDirection: "row",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderBottomWidth: 1,
    gap: 3,
  },
  filterTab: {
    flex: 1,
    minHeight: 28,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryStrip: {
    flexDirection: "row",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  stripCol: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  summaryIcon: {
    marginTop: 2,
  },
  webHeading: { paddingHorizontal:24, paddingTop:24, paddingBottom:20, flexDirection:"row", alignItems:"center", gap:16 },
  readOnly: { flexDirection:"row", alignItems:"center", gap:8, padding:10, borderWidth:1, borderRadius:9999 },
  itemGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 16,
  },
  itemCardGrid: {
    flexBasis: "47%",
    flexGrow: 1,
    minWidth: 280,
  },
  itemCard: {
    padding: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  cardMainTouch: {
    minHeight: 40,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  badgeGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginTop: 6,
  },
  cardBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(128,128,128,0.2)",
  },
  quickActions: {
    flexDirection: "row",
    gap: 6,
  },
  actionBtn: {
    minHeight: 28,
    minWidth: 48,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderWidth: 1,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  undoToast: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 16,
    marginTop: 8,
    paddingLeft: 12,
    paddingRight: 4,
    borderWidth: 1,
    borderRadius: 6,
  },
  undoBtn: {
    minHeight: 44,
    minWidth: 56,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
  },
});
