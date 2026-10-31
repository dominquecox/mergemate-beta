import { Avatar } from "../../src/components/Avatar";
import { relativeTime, activityAction } from "../../src/format/activity";
import React, { useState } from "react";
import { View, FlatList, TouchableOpacity, Pressable, StyleSheet, Platform } from "react-native";
import { androidRipple } from "../../src/platform/android";
import { Text } from "../../src/components/Text";
import { useRouter } from "expo-router";
import { useTheme } from "../../src/context/ThemeContext";
import { api } from "../../src/api";
import { toUserMessage } from "../../src/api/errors";
import { Notification, NotificationFilter } from "../../src/types";
import { Header } from "../../src/components/Header";
import { StatusPill } from "../../src/components/StatusPill";
import { RiskBadge } from "../../src/components/RiskBadge";
import { EmptyState } from "../../src/components/EmptyState";
import { ErrorState } from "../../src/components/ErrorState";
import { LoadingState } from "../../src/components/LoadingState";
import { useLayout } from "../../src/layout/useLayout";
import { Icon } from "../../src/components/Icon";

import { usePagedList } from "../../src/hooks/usePagedList";

export default function NotificationsScreen() {
  const { colors, typography, spacing, radius } = useTheme();
  const {isDesktop}=useLayout();
  const router = useRouter();

  const [filter, setFilter] = useState<NotificationFilter>("all");
  const {items,setItems,loading:isLoading,busy,error,refresh:loadNotifications,more,hasMore} = usePagedList(`activity:${filter}`, cursor=>api.getNotificationPage(filter,cursor));

  const markAllRead = () => {
    setItems((prev) => prev.map((item) => ({ ...item, read: true })));
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Header
        title="Notifications"
        rightAction={items.some((item) => !item.read) ? (
          <TouchableOpacity
            onPress={markAllRead}
            style={styles.markReadBtn}
            accessibilityRole="button"
            accessibilityLabel="Mark all notifications as read"
          >
            <Text style={[typography.subhead, { color: colors.brandLight, fontWeight: "600" }]}>Mark all read</Text>
          </TouchableOpacity>
        ) : undefined}
      />

      {/* Filter Chips */}
      <View style={[styles.chipsRow, { borderBottomColor: colors.border }]} accessibilityRole="tablist">
        {(["all", "review", "mentions", "mine"] as NotificationFilter[]).map((tab) => {
          const active = filter === tab;
          let label = "All";
          if (tab === "review") label = "Reviews";
          if (tab === "mentions") label = "Mentions";
          if (tab === "mine") label = "Mine";

          return (
            <TouchableOpacity
              key={tab}
              onPress={() => setFilter(tab)}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? colors.brand : colors.surfaceElevated,
                  borderColor: active ? colors.brand : colors.border,
                  borderRadius: radius.full,
                },
              ]}
              accessibilityRole="tab"
              accessibilityLabel={`${label} notifications`}
              accessibilityState={{ selected: active }}
            >
              <Text
                style={[
                  typography.caption,
                  { color: active ? "#FFFFFF" : colors.textSecondary, fontWeight: "600" },
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {isLoading ? (
        <LoadingState
          title="Loading notifications..."
          message="Checking for recent pull request activity."
        />
      ) : error && items.length===0 ? (
        <ErrorState
          title="Could not load notifications"
          message={error}
          onRetry={loadNotifications}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon="notifications-off-outline"
          title="No Alerts"
          message="No notification events match your selected filter."
          actionTitle="Check Again"
          onAction={loadNotifications}
        />
      ) : (
        <FlatList data={items} keyExtractor={item=>item.id} initialNumToRender={8} maxToRenderPerBatch={8} windowSize={5}
          contentContainerStyle={{padding:isDesktop?24:16,paddingBottom:48}}
          onEndReached={()=>{if(!error)void more();}} onEndReachedThreshold={0.4}
          ListFooterComponent={hasMore?<TouchableOpacity disabled={busy} onPress={()=>void more()} style={{minHeight:44,padding:16}} accessibilityRole="button"><Text style={{color:colors.brandLight}}>{busy?'Loading…':'Load more activity'}</Text></TouchableOpacity>:undefined}
          renderItem={({item,index})=>{const day=new Date(item.updatedAt).toLocaleDateString();const previous=items[index-1];const showDay=!previous || new Date(previous.updatedAt).toLocaleDateString()!==day;return <View>{showDay && <Text accessibilityRole="header" style={[typography.subhead,{color:colors.text,marginTop:20,marginBottom:12}]}>{day===new Date().toLocaleDateString()?'Today':day}</Text>}<Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Review ${item.title}`} onPress={()=>{const [owner="owner",repo="repo"]=item.repo.split("/");router.push(`/pr/${owner}/${repo}/${item.number}`);}} android_ripple={androidRipple()} style={({pressed})=>[{backgroundColor:item.read?colors.surface:colors.surfaceElevated,padding:16,borderTopWidth:1,borderTopColor:colors.border},pressed && {opacity:0.88}]}>
                <View style={{flexDirection:"row",gap:12,alignItems:"flex-start"}}>
                  <Avatar login={item.author} size={32}/>
                  <View style={{flex:1,minWidth:0}}>
                    <View style={{flexDirection:"row",alignItems:"flex-start",gap:8}}><Text style={[typography.code,{color:colors.textSecondary,fontSize:11,flex:1}]}>{item.repo} · #{item.number}</Text><Text style={[typography.caption,{color:colors.textSecondary}]}>{relativeTime(item.updatedAt)}</Text>{!item.read && <View accessibilityLabel="Unread" style={{width:6,height:6,borderRadius:3,backgroundColor:colors.brandLight,marginTop:5}}/>}</View>
                    <Text style={[typography.body,{color:colors.text,marginTop:8}]}><Text style={{fontWeight:"600"}}>@{item.author}</Text> {activityAction(item.kind)}</Text>
                    <Text style={[typography.headline,{color:colors.text,marginTop:4}]}>{item.title}</Text>
                    {!!item.summaryLine && <Text style={[typography.footnote,{color:colors.textSecondary,marginTop:8}]}>{item.summaryLine}</Text>}
                    <View style={{flexDirection:"row",gap:8,alignItems:"center",flexWrap:"wrap",marginTop:12}}><StatusPill status={item.status}/>{item.risk && <RiskBadge level={item.risk} compact/>}</View>
                  </View>
                  <Icon name="chevron-forward" size={16} color={colors.textMuted}/>
                </View>
              </Pressable></View>;}}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  quietRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  root: {
    flex: 1,
  },
  markReadBtn: {
    minHeight: 44,
    paddingHorizontal: 8,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  chipsRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    gap: 8,
  },
  chip: {
    minHeight: 44,
    minWidth: 64,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  quietBanner: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  notifCard: {
    padding: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  notifHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  leftMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  unreadDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  notifFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(128,128,128,0.2)",
  },
});
