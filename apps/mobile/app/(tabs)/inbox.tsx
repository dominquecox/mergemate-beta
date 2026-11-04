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
import React, { useState, useRef,useEffect,useCallback,useMemo } from "react";
import {AppState,Platform, View, FlatList, RefreshControl, ScrollView, TouchableOpacity, Pressable, StyleSheet } from "react-native";
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
import { CompactControl } from "../../src/components/CompactControl";
import { controlDensity } from "../../src/theme";
import { useTopBarActionSetters } from "../../src/context/TopBarActionsContext";

import { usePagedList } from "../../src/hooks/usePagedList";
import { attentionFirst, groupByRepo, type InboxRow } from "../../src/workspace/inboxGroups";

/** Short "updated" stamp: time today, otherwise month and day. */
function updatedLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString([], { month: "short", day: "numeric" });
}

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
  const density = controlDensity[isDesktop ? "desktop" : "narrow"];
  const {setActions:setTopBarActions,clearActions:clearTopBarActions}=useTopBarActionSetters();

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
  const [grouped,setGrouped]=useState(false),[groupMenuOpen,setGroupMenuOpen]=useState(false);
  const rows:InboxRow[]=grouped?groupByRepo(items):attentionFirst(items);
  const needsYouCount=items.filter(item=>item.kind==="review").length;
  const fyiCount=items.filter(item=>item.kind==="mention").length;
  const mineCount=items.filter(item=>item.kind==="mine").length;
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

  // Keyed on the narration text: `items` is a new array every render, and a new element would re-run the focus effect.
  const narration=inboxNarration(items).join("\n");
  const inboxReadout=useMemo(()=><ReadoutControls variant="toolbar" label="Inbox overview" sentences={narration?narration.split("\n"):[]}/>,[narration]);
  useFocusEffect(useCallback(()=>{
    if(Platform.OS!=="web"||isDesktop)return;
    setTopBarActions(inboxReadout);
    return clearTopBarActions;
  },[clearTopBarActions,inboxReadout,isDesktop,setTopBarActions]));

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
            {(Platform.OS!=="web"||isDesktop)&&<ReadoutControls variant="toolbar" label="Inbox overview" sentences={inboxNarration(items)}/>}
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
            {flags.highlight && (Platform.OS !== "web" || isDesktop) && <TouchableOpacity
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
            <Text style={[typography.footnote, { color: colors.brandLight, fontWeight: "600" }]}>Undo</Text>
          </TouchableOpacity>
        </View>
      )}

        <FlatList
          ref={listRef}
          onScroll={event=>{if(listActive.current)scrollOffset.current=event.nativeEvent.contentOffset.y;}} scrollEventThrottle={16}
          key={`${isDesktop?'desktop':'phone'}:${grouped?'grouped':'flat'}`}
          data={isLoading?[]:rows}
          ListEmptyComponent={isLoading?<LoadingState title="Loading your inbox..." message="Fetching accessible pull requests and your Inbox state."/>:error?<ErrorState title="Could not load your inbox" message={error} onRetry={hasMore?more:fetchItems}/>:<EmptyState icon="checkmark-done-outline" title={hasMore?"More results are available":"Inbox Zero"} message={hasMore?"No visible items on this page. Load more to continue checking your queue.":"No pull requests need your attention in this view."} actionTitle={hasMore?"Load more pull requests":undefined} onAction={hasMore?more:undefined}/>}
          keyExtractor={row=>row.type==='header'?`repo:${row.repo}`:row.type==='section'?`section:${row.label}`:row.item.id} initialNumToRender={8} maxToRenderPerBatch={8} windowSize={5}
          contentContainerStyle={{padding:isDesktop?24:spacing.base,paddingBottom:96}}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.brandLight}/>}
          onEndReached={()=>{if(!error)void more();}} onEndReachedThreshold={0.4}
          ListHeaderComponent={<>
      <AccessGuidanceBanner error={error} compact />

      {/* The Inbox opens on filters and counts, then the PR list. Voice controls live in the top bar. */}
      <View style={[styles.inboxToolbar, isDesktop && styles.inboxToolbarDesktop]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroller}
          contentContainerStyle={styles.filterRow}
          accessibilityRole="tablist"
        >
          {(["all", "review", "mentions", "mine"] as NotificationFilter[]).map((tab) => {
            const isSelected = filter === tab;
            let label = "All";
            if (tab === "review") label = "Review";
            if (tab === "mentions") label = "Mentions";
            if (tab === "mine") label = "Mine";

            return (
              <Pressable
                key={tab}
                ref={node=>bindFilterTab(tab,node,isSelected)}
                aria-selected={isSelected}
                onPress={() => selectFilter(tab)}
                style={({pressed})=>[
                  styles.filterHit,
                  {minHeight:density.chip.hitHeight,opacity:pressed?0.82:1},
                ]}
                accessibilityRole="tab"
                accessibilityLabel={tab === "review" ? "Needs review pull requests" : `${label} pull requests`}
                accessibilityState={{ selected: isSelected }}
              >
                <View style={{height:density.chip.visualHeight,paddingHorizontal:density.chip.paddingHorizontal,borderRadius:radius.full,borderWidth:1,borderColor:isSelected?colors.brandMuted:colors.border,backgroundColor:isSelected?colors.brandSubtle:colors.surface,alignItems:"center",justifyContent:"center"}} pointerEvents="none">
                  <Text numberOfLines={1} ellipsizeMode="tail"
                    style={[
                      typography.caption,
                      {
                        color: isSelected ? colors.brandLight : colors.textSecondary,
                        fontWeight: isSelected ? "600" : "500",
                      },
                    ]}
                  >
                    {label}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.inboxMetaRow}>
          <Text
            style={[typography.caption,{color:colors.textSecondary,fontWeight:"500"}]}
            accessibilityLabel={`Summary: ${needsYouCount} needs you, ${fyiCount} FYI, ${mineCount} mine`}
          >
            <Text style={{color:needsYouCount>0?colors.statusWarning:colors.statusGood,fontWeight:"600"}}>{needsYouCount} needs you</Text>
            {` · ${fyiCount} FYI · ${mineCount} mine`}
          </Text>

          {isDesktop ? (
            <CompactControl
              onPress={()=>setGrouped(value=>!value)}
              isDesktop
              variant="secondary"
              selected={grouped}
              accessibilityRole="switch"
              accessibilityLabel="Group by repository"
            >
              <Icon name="folder-outline" size={16} color={grouped?colors.brandLight:colors.textSecondary}/>
              <Text style={[typography.caption,{color:grouped?colors.brandLight:colors.textSecondary,fontWeight:"600"}]}>{grouped?"Grouped":"Group by repo"}</Text>
            </CompactControl>
          ) : (
            <View style={styles.groupMenuAnchor}>
              <CompactControl
                onPress={()=>setGroupMenuOpen(open=>!open)}
                isDesktop={false}
                variant="icon"
                selected={groupMenuOpen}
                accessibilityLabel="More Inbox options"
              >
                <Icon name="ellipsis-horizontal" size={density.icon.iconSize} color={colors.textSecondary}/>
              </CompactControl>
              {groupMenuOpen&&(
                <Pressable
                  onPress={()=>{setGrouped(value=>!value);setGroupMenuOpen(false);}}
                  accessibilityRole="switch"
                  accessibilityLabel="Group by repository"
                  accessibilityState={{checked:grouped}}
                  style={({pressed})=>[styles.groupMenu,{backgroundColor:colors.surfaceElevated,borderColor:colors.border,opacity:pressed?0.86:1}]}
                >
                  <Icon name="folder-outline" size={16} color={grouped?colors.brandLight:colors.textSecondary}/>
                  <Text style={[typography.caption,{color:grouped?colors.brandLight:colors.text,fontWeight:"600"}]}>Group by repository</Text>
                  <Icon name={grouped?"checkmark-circle":"ellipse-outline"} size={16} color={grouped?colors.statusGood:colors.textMuted}/>
                </Pressable>
              )}
            </View>
          )}
        </View>
      </View>

</>}
          ListFooterComponent={hasMore || error?<TouchableOpacity disabled={isRefreshing} onPress={()=>void more()} accessibilityRole="button" style={{padding:16,minHeight:44}}><Text style={{color:colors.brandLight}}>{isRefreshing?'Loading…':error?'Retry loading pull requests':'Load more pull requests'}</Text></TouchableOpacity>:undefined}
          renderItem={({item:row})=>row.type==='header'?(<View testID={`inbox-repo-${row.repo}`} accessibilityRole="header" accessibilityLabel={`${row.repo}, ${row.count} pull request${row.count===1?'':'s'}`} style={{flexDirection:'row',alignItems:'center',gap:8,marginBottom:8,marginTop:4}}><Icon name="folder-outline" size={14} color={colors.brandLight}/><Text style={[typography.subhead,{color:colors.text,fontWeight:'600',flexShrink:1}]}>{row.repo}</Text><Text style={[typography.caption,{color:colors.textSecondary}]}>{row.count}</Text></View>):row.type==='section'?(<View style={{flexDirection:'row',alignItems:'center',gap:8,marginBottom:8,marginTop:12}} accessibilityRole="header" accessibilityLabel={row.label}><Text style={[typography.subhead,{color:colors.brandLight,fontWeight:'600',fontSize:14}]}>{row.label}</Text></View>):((item:Notification)=>(
              <View
                key={item.id}
                style={[
                  styles.itemCard,
                  {
                    flexDirection: isDesktop ? "row" : "column",
                    alignItems: isDesktop ? "center" : "stretch",
                    gap: isDesktop ? 12 : 4,
                    paddingVertical: 8,
                    paddingHorizontal: 12,
                    marginBottom: 6,
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    borderRadius: 10,
                    borderLeftColor: item.risk === "high" ? colors.statusAlert : colors.border,
                    borderLeftWidth: item.risk === "high" ? 3 : 1,
                  },
                ]}
              >
                <Pressable
                  onPress={() => navigateToPr(item)}
                  android_ripple={androidRipple()}
                  style={({ pressed }) => [{ flex: 1, minWidth: 0, minHeight: 44, justifyContent: "center", flexDirection: isDesktop ? "row" : "column", alignItems: isDesktop ? "center" : "stretch", gap: isDesktop ? 12 : 2 }, pressed && { opacity: 0.85 }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Open pull request #${item.number}: ${item.title} in ${item.repo}, ${item.risk || "normal"} risk`}
                >
                  <Text style={[typography.code, { color: colors.textSecondary, width: isDesktop ? 200 : undefined }]} numberOfLines={1}>
                    {item.repo}#{item.number}
                  </Text>
                  <Text style={[typography.subhead, { color: colors.text, flex: isDesktop ? 1 : undefined, minWidth: 0 }]} numberOfLines={isDesktop ? 1 : 2} accessibilityLabel={item.title}>
                    {item.title}
                  </Text>
                  <View style={[styles.badgeGroup, { flexShrink: 0 }]}>
                    {item.status && <StatusPill status={item.status} />}
                    {item.risk && <RiskBadge level={item.risk} compact />}
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, width: isDesktop ? 170 : undefined }}>
                    <Avatar login={item.author} size={15} />
                    <Text style={[typography.caption, { color: colors.textSecondary, flexShrink: 1 }]} numberOfLines={1}>
                      @{item.author} · {updatedLabel(item.updatedAt)}
                    </Text>
                  </View>
                </Pressable>

                <View style={[styles.quickActions, { alignSelf: isDesktop ? "center" : "flex-end" }]}>
                  <TouchableOpacity
                    disabled={acting||isDemo} onPress={() => handleSnooze(item)}
                    style={[styles.actionBtn, { borderColor: colors.border, backgroundColor: colors.surfaceElevated, borderRadius: 6 }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Snooze ${item.title}`}
                  >
                    <Text style={[typography.caption, { color: colors.textSecondary, fontWeight: "500" }]}>Snooze</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    disabled={acting||isDemo} onPress={() => handleDone(item)}
                    style={[styles.actionBtn, { borderColor: colors.statusGood, backgroundColor: colors.statusGoodBg, borderRadius: 6 }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Mark ${item.title} as done`}
                  >
                    <Text style={[typography.caption, { color: colors.statusGood, fontWeight: "600" }]}>Done</Text>
                  </TouchableOpacity>
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
  inboxToolbar: {
    gap: 4,
    marginBottom: 10,
  },
  inboxToolbarDesktop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  filterScroller: { flexGrow: 0, flexShrink: 1 },
  filterRow: { flexDirection: "row", gap: 6 },
  filterHit: {
    minWidth: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  inboxMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
    gap: 8,
  },
  groupMenuAnchor: {
    position: "relative",
    zIndex: 10,
  },
  groupMenu: {
    position: "absolute",
    right: 0,
    top: 42,
    width: 190,
    minHeight: 44,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
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
    minHeight: 44,
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
    minHeight: 44,
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
