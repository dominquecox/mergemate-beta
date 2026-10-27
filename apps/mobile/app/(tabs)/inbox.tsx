import React, { useState, useRef } from "react";
import { View, FlatList, RefreshControl, TouchableOpacity, Pressable, StyleSheet } from "react-native";
import { androidRipple } from "../../src/platform/android";
import { Text } from "../../src/components/Text";
import { useRouter } from "expo-router";
import { useTheme } from "../../src/context/ThemeContext";
import { api } from "../../src/api";
import { toUserMessage } from "../../src/api/errors";
import { Notification, NotificationFilter } from "../../src/types";
import { Header } from "../../src/components/Header";
import { RiskBadge } from "../../src/components/RiskBadge";
import { StatusPill } from "../../src/components/StatusPill";
import { EmptyState } from "../../src/components/EmptyState";
import { ErrorState } from "../../src/components/ErrorState";
import { LoadingState } from "../../src/components/LoadingState";
import { Icon } from "../../src/components/Icon";
import { useLayout } from "../../src/layout/useLayout";

import { usePagedList } from "../../src/hooks/usePagedList";

export default function InboxScreen() {
  const router = useRouter();
  const { colors, typography, spacing, radius } = useTheme();
  const { isDesktop } = useLayout();

  const [filter, setFilter] = useState<NotificationFilter>("all");
  const {items,setItems,loading:isLoading,busy:isRefreshing,error,setError,refresh:fetchItems,more,hasMore} = usePagedList(`inbox:${filter}`, cursor=>api.getNotificationPage(filter,cursor));
  const [undoItem, setUndoItem] = useState<Notification | null>(null);
  const actionLock = useRef(false);
  const [acting,setActing] = useState(false);
  const onRefresh = () => { api.invalidateCache(); void fetchItems(); };

  // The card leaves the list at once; if the API refuses, it comes back and the reason is shown.
  const applyAction = async (item: Notification, action: () => Promise<void>) => {
    if(actionLock.current)return;
    actionLock.current=true; setActing(true);
    setUndoItem(item);
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    try {
      await action();
    } catch (e) {
      setUndoItem(null);
      setItems((prev) => [item, ...prev]);
      setError(toUserMessage(e, "Couldn't update that pull request."));
    } finally { actionLock.current=false; setActing(false); }
  };

  const handleDone = (item: Notification) => applyAction(item, () => api.markNotificationDone(item.id,item.updatedAt));

  const handleSnooze = (item: Notification) =>
    applyAction(item, () => api.snoozeNotification(item.id, new Date(Date.now() + 86400000).toISOString()));

  const handleUndo = async () => {
    if (!undoItem || actionLock.current) return;
    actionLock.current=true; setActing(true);
    const item = undoItem;
    setUndoItem(null);
    setItems((prev) => [item, ...prev]);
    try {
      await api.restoreNotification(item.id);
    } catch (e) {
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      setError(toUserMessage(e, "Couldn't undo that."));
    } finally {actionLock.current=false; setActing(false);}
  };

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
            <TouchableOpacity
              onPress={() => router.push("/search")}
              style={styles.iconBtn}
              accessibilityRole="button"
              accessibilityLabel="Search pull requests"
            >
              <Icon name="search-outline" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push("/highlight")}
              style={styles.iconBtn}
              accessibilityRole="button"
              accessibilityLabel="Highlight screenshot"
            >
              <Icon name="camera-outline" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        }
      />

      {/* Segmented Filter Control */}
      <View style={[styles.filterBar, { borderBottomColor: colors.border }, { marginHorizontal:16, borderBottomWidth:0, paddingHorizontal:4, paddingVertical:4, backgroundColor:colors.surfaceElevated, borderRadius:radius.lg }]} accessibilityRole="tablist">
        {(["all", "review", "mentions", "mine"] as NotificationFilter[]).map((tab) => {
          const isSelected = filter === tab;
          let label = "All";
          if (tab === "review") label = "Needs review";
          if (tab === "mentions") label = "Mentions";
          if (tab === "mine") label = "Mine";

          return (
            <TouchableOpacity
              key={tab}
              onPress={() => setFilter(tab)}
              style={[
                styles.filterTab,
                {
                  backgroundColor: isSelected ? colors.brandSubtle : "transparent",
                  borderRadius: radius.md,
                },
              ]}
              accessibilityRole="tab"
              accessibilityLabel={`${label} pull requests`}
              accessibilityState={{ selected: isSelected }}
            >
              <Text
                style={[
                  typography.subhead,
                  {
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

      {/* Undo Toast */}
      {undoItem && (
        <View
          style={[styles.undoToast, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
          accessibilityLiveRegion="polite"
        >
          <Text style={[typography.footnote, { color: colors.text }]}>Moved out of your inbox</Text>
          <TouchableOpacity
            disabled={acting} onPress={handleUndo}
            style={styles.undoBtn}
            accessibilityRole="button"
            accessibilityLabel={`Undo moving ${undoItem.title}`}
          >
            <Text style={[typography.footnote, { color: colors.brandLight, fontWeight: "700" }]}>Undo</Text>
          </TouchableOpacity>
        </View>
      )}

      {isLoading ? (
        <LoadingState
          title="Loading your inbox..."
          message="Fetching pull requests, status checks, and AI summaries."
        />
      ) : error && items.length===0 ? (
        <ErrorState
          title="Could not load your inbox"
          message={error}
          onRetry={fetchItems}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon="checkmark-done-outline"
          title="Inbox Zero"
          message="You're all caught up! No pull requests need your attention in this view."
          actionTitle="Refresh Inbox"
          onAction={fetchItems}
        />
      ) : (
        <FlatList
          key={isDesktop?'desktop':'phone'} numColumns={isDesktop?2:1} columnWrapperStyle={isDesktop?{gap:16}:undefined}
          data={items} keyExtractor={item=>item.id} initialNumToRender={8} maxToRenderPerBatch={8} windowSize={5}
          contentContainerStyle={{padding:isDesktop?24:spacing.base,paddingBottom:80}}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.brandLight}/>}
          onEndReached={()=>{if(!error)void more();}} onEndReachedThreshold={0.4}
          ListHeaderComponent={<>          {/* Summary Strip Card */}
          <View
            style={[styles.summaryStrip, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg }, { padding:16, marginBottom:16 }]}
            accessibilityLabel={`Summary: ${items.filter((i) => i.kind === "review").length} needs you, ${items.filter((i) => i.kind === "mention").length} FYI, ${items.filter((i) => i.kind === "mine").length} mine`}
          >
            <View style={styles.stripCol}>
              <Text style={[typography.headline, { color: colors.text }]}>
                {items.filter((i) => i.kind === "review").length}
              </Text>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>Needs you</Text>
            </View>
            <View style={styles.stripCol}>
              <Text style={[typography.headline, { color: colors.text }]}>
                {items.filter((i) => i.kind === "mention").length}
              </Text>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>FYI</Text>
            </View>
            <View style={styles.stripCol}>
              <Text style={[typography.headline, { color: colors.text }]}>
                {items.filter((i) => i.kind === "mine").length}
              </Text>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>Mine</Text>
            </View>
          </View>

</>}
          ListFooterComponent={hasMore || error?<TouchableOpacity disabled={isRefreshing} onPress={()=>void more()} accessibilityRole="button" style={{padding:16,minHeight:44}}><Text style={{color:colors.brandLight}}>{isRefreshing?'Loading…':error?'Retry loading pull requests':'Load more pull requests'}</Text></TouchableOpacity>:undefined}
          renderItem={({item})=>(
              <View
                key={item.id}
                style={[
                  styles.itemCard,
                  isDesktop && {flex:1,maxWidth:"50%"},

                  { padding:16, marginBottom:16 },
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    borderRadius: radius.lg,
                    borderLeftColor: item.risk === "high" ? colors.riskHigh : colors.border,
                    borderLeftWidth: item.risk === "high" ? 4 : 1,
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
                  <View style={[styles.cardTop,{flexWrap:"wrap",gap:8}]}>
                    <Text style={[typography.caption, { color: colors.textMuted, fontFamily: typography.code.fontFamily, flexShrink:1 }]}>
                      {item.repo} #{item.number}
                    </Text>
                    <View style={styles.badgeGroup}>
                      <StatusPill status={item.status} />
                      {item.risk && <RiskBadge level={item.risk} compact />}
                    </View>
                  </View>

                  <Text style={[typography.headline, { color: colors.text, marginTop: 4 }]} numberOfLines={2}>
                    {item.title}
                  </Text>

                  {item.summaryLine && (
                    <View style={[styles.summaryRow,{padding:12,backgroundColor:colors.surfaceElevated,borderRadius:radius.sm,marginTop:12}]}>
                      <Icon name="sparkles" size={12} color={colors.brandLight} style={styles.summaryIcon} />
                      <Text style={[typography.footnote, { color: colors.textSecondary, flex: 1 }]} numberOfLines={2}>
                        {item.summaryLine}
                      </Text>
                    </View>
                  )}
                </Pressable>

                <View style={[styles.cardBottom,{flexWrap:"wrap",gap:8,borderTopColor:colors.border,marginTop:12,paddingTop:12}]}>
                  <Text style={[typography.caption, { color: colors.textMuted, flex: 1 }]}>
                    By @{item.author} · {new Date(item.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </Text>

                  <View style={styles.quickActions}>
                    <TouchableOpacity
                      disabled={acting} onPress={() => handleSnooze(item)}
                      style={[styles.actionBtn, { borderColor: colors.border },{borderRadius:radius.md}]}
                      accessibilityRole="button"
                      accessibilityLabel={`Snooze ${item.title}`}
                    >
                      <Text style={[typography.caption, { color: colors.textSecondary, fontWeight: "600" }]}>Snooze</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      disabled={acting} onPress={() => handleDone(item)}
                      style={[styles.actionBtn, { borderColor: colors.border, backgroundColor: colors.surfaceInteractive },{borderRadius:radius.md}]}
                      accessibilityRole="button"
                      accessibilityLabel={`Mark ${item.title} as done`}
                    >
                      <Text style={[typography.caption, { color: colors.text, fontWeight: "600" }]}>Done</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
)}
        />
      )}
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
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    gap: 6,
  },
  filterTab: {
    flex: 1,
    minHeight: 44,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryStrip: {
    flexDirection: "row",
    padding: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  stripCol: {
    flex: 1,
    alignItems: "center",
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
    padding: 14,
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
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(128,128,128,0.2)",
  },
  quickActions: {
    flexDirection: "row",
    gap: 8,
  },
  actionBtn: {
    minHeight: 44,
    minWidth: 64,
    paddingHorizontal: 12,
    paddingVertical: 8,
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
