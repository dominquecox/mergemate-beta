import { activityDay } from "../../src/format/activityDays";
import { Avatar } from "../../src/components/Avatar";
import { relativeTime, activityAction } from "../../src/format/activity";
import React, { useEffect, useState } from "react";
import { View, FlatList, TouchableOpacity, Pressable, ScrollView, StyleSheet } from "react-native";
import { androidRipple } from "../../src/platform/android";
import { Text } from "../../src/components/Text";
import { useRouter } from "expo-router";
import { useTheme } from "../../src/context/ThemeContext";
import { useAlerts } from "../../src/context/AlertsContext";
import { api } from "../../src/api";
import { toUserMessage } from "../../src/api/errors";
import { NotificationFilter } from "../../src/types";
import { Header } from "../../src/components/Header";
import { StatusPill } from "../../src/components/StatusPill";
import { RiskBadge } from "../../src/components/RiskBadge";
import { EmptyState } from "../../src/components/EmptyState";
import { ErrorState } from "../../src/components/ErrorState";
import { LoadingState } from "../../src/components/LoadingState";
import { InfoTip } from "../../src/components/InfoTip";
import { useLayout } from "../../src/layout/useLayout";
import { Icon } from "../../src/components/Icon";
import { CompactControl } from "../../src/components/CompactControl";
import { controlDensity } from "../../src/theme";

import { usePagedList } from "../../src/hooks/usePagedList";

export default function NotificationsScreen() {
  const { colors, typography, radius } = useTheme();
  const { isDesktop } = useLayout();
  const router = useRouter();
  const { isRead, markRead, markUnread, markAllRead: markAllAlertsRead, syncItems } = useAlerts();

  const [history, setHistory] = useState(false);
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [mutationError, setMutationError] = useState<string | null>(null);
  const {
    items,
    setItems,
    loading: isLoading,
    busy,
    error,
    refresh: loadNotifications,
    more,
    hasMore,
  } = usePagedList(
    `activity:${history}:${filter}`,
    (cursor) =>
      history
        ? api.getActivityHistory(filter === "review" ? "review" : "all", cursor)
        : api.getNotificationPage(filter, cursor),
    () => api.invalidateInbox(),
  );

  useEffect(() => {
    if (!history && items.length > 0) {
      syncItems(items);
    }
  }, [history, items, syncItems]);

  const unreadItems = items.filter((item) => !isRead(item));
  const density = controlDensity[isDesktop ? "desktop" : "narrow"];

  const handleMarkItemRead = async (id: string) => {
    const item = items.find((value) => value.id === id);
    const wasRead = item ? isRead(item) : false;
    setMutationError(null);
    markRead(id);
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, read: true } : item)));
    if (!history) return;
    try {
      await api.markActivityRead(id);
    } catch (cause) {
      if (!wasRead) markUnread([id]);
      setItems((prev) => prev.map((value) => (value.id === id ? { ...value, read: item?.read ?? false } : value)));
      setMutationError(toUserMessage(cause, "We couldn't mark that activity as read. Refresh and try again."));
    }
  };

  const handleMarkAllRead = async () => {
    const unread = items.filter((item) => !isRead(item));
    const ids = unread.map((item) => item.id);
    setMutationError(null);
    markAllAlertsRead(ids);
    setItems((prev) => prev.map((item) => ({ ...item, read: true })));
    if (history) {
      const results = await Promise.allSettled(unread.map((item) => api.markActivityRead(item.id)));
      const failed = results.flatMap((result, index) => result.status === "rejected" ? [unread[index]!] : []);
      if (failed.length) {
        const failedIds = failed.map((item) => item.id);
        markUnread(failedIds);
        const failedSet = new Set(failedIds);
        setItems((prev) => prev.map((item) => failedSet.has(item.id) ? { ...item, read: failed.find((value) => value.id === item.id)?.read ?? false } : item));
        const firstFailure = results.find((result) => result.status === "rejected");
        setMutationError(toUserMessage(firstFailure?.status === "rejected" ? firstFailure.reason : null, `We couldn't mark ${failed.length} activities as read. Refresh and try again.`));
      }
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Header
        title="Notifications"
        rightAction={
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <InfoTip
              title="Alerts & Activity Feed"
              body="Switch between your active Open PR Inbox alerts and your 7-day repository webhook Event History. Use 'Mark read' on any row or 'Mark all as read' to clear your unread alert badge."
            />
            {unreadItems.length > 0 && (
              <CompactControl
                onPress={handleMarkAllRead}
                isDesktop={isDesktop}
                variant="secondary"
                accessibilityLabel="Mark all notifications as read"
              >
                <Text style={[typography.caption, { color: colors.statusGood, fontWeight: "600" }]}>
                  Mark all as read ({unreadItems.length})
                </Text>
              </CompactControl>
            )}
          </View>
        }
      />

      <View
        style={[
          styles.topBentoControls,
          { paddingHorizontal: density.pageGutter },
          isDesktop && styles.desktopToolbar,
        ]}
      >
        <View
          style={[styles.modeGroup, { borderColor: colors.border, backgroundColor: colors.surface }]}
          accessibilityRole="tablist"
        >
          {[false, true].map((value) => (
            <CompactControl
              key={String(value)}
              isDesktop={isDesktop}
              variant="segment"
              selected={history === value}
              accessibilityRole="tab"
              accessibilityLabel={value ? "Event history" : "Open PR inbox"}
              onPress={() => {
                setHistory(value);
                setFilter("all");
              }}
            >
              <Text
                style={[
                  typography.caption,
                  { color: history === value ? colors.brandLight : colors.textSecondary, fontWeight: history === value ? "600" : "500" },
                ]}
              >
                {value ? "Event history" : "Open PR inbox"}
              </Text>
            </CompactControl>
          ))}
          <View
            style={{
              height: density.chip.visualHeight,
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              paddingHorizontal: density.chip.paddingHorizontal,
              borderRadius: radius.full,
              backgroundColor: unreadItems.length > 0 ? colors.statusWarningBg : colors.statusGoodBg,
            }}
          >
            <Icon
              name={unreadItems.length > 0 ? "notifications-outline" : "checkmark-circle-outline"}
              size={12}
              color={unreadItems.length > 0 ? colors.statusWarning : colors.statusGood}
            />
            <Text
              style={[
                typography.caption,
                {
                  color: unreadItems.length > 0 ? colors.statusWarning : colors.statusGood,
                  fontWeight: "600",
                },
              ]}
            >
              {unreadItems.length > 0 ? `${unreadItems.length} unread` : "All read"}
            </Text>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroller}
          contentContainerStyle={styles.chipsRow}
          accessibilityRole="tablist"
        >
          {((history ? ["all", "review"] : ["all", "review", "mentions", "mine"]) as NotificationFilter[]).map(
            (tab) => {
              const active = filter === tab;
              let label = "All";
              if (tab === "review") label = "Reviews";
              if (tab === "mentions") label = "Mentions";
              if (tab === "mine") label = "Mine";

              return (
                <CompactControl
                  key={tab}
                  onPress={() => setFilter(tab)}
                  isDesktop={isDesktop}
                  variant="chip"
                  selected={active}
                  accessibilityRole="tab"
                  accessibilityLabel={`${label} notifications`}
                >
                  <Text
                    style={[
                      typography.caption,
                      { color: active ? colors.brandLight : colors.textSecondary, fontWeight: active ? "600" : "500" },
                    ]}
                  >
                    {label}
                  </Text>
                </CompactControl>
              );
            },
          )}
        </ScrollView>
      </View>

      {history && (
        <View
          style={{
            marginHorizontal: isDesktop ? 24 : 16,
            marginBottom: 8,
            padding: 10,
            borderRadius: radius.md,
            backgroundColor: colors.statusInfoBg,
            borderWidth: 1,
            borderColor: colors.statusInfo,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Icon name="information-circle-outline" size={16} color={colors.statusInfo} />
          <Text style={[typography.caption, { color: colors.text, flex: 1 }]}>
            Last 7 days of received repository events. Actor is the event sender, not the PR or commit author. Earlier events and current PR status may be unavailable.
          </Text>
        </View>
      )}

      {!!(mutationError || (error && items.length > 0)) && (
        <ErrorState
          title={mutationError ? "Read status was not saved" : "Notifications could not refresh"}
          message={mutationError ?? error ?? "Refresh and try again."}
          onRetry={loadNotifications}
          retryLabel="Refresh notifications"
        />
      )}

      {isLoading ? (
        <LoadingState title="Loading notifications..." message="Checking for recent pull request activity." />
      ) : error && items.length === 0 ? (
        <ErrorState title="Could not load notifications" message={error} onRetry={loadNotifications} />
      ) : items.length === 0 ? (
        <EmptyState
          icon="notifications-off-outline"
          title="No Alerts"
          message="No notification events match your selected filter."
          actionTitle="Check Again"
          onAction={loadNotifications}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={5}
          contentContainerStyle={{ padding: isDesktop ? 24 : 16, paddingBottom: 96 }}
          onEndReached={() => {
            if (!error) void more();
          }}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            hasMore ? (
              <TouchableOpacity
                disabled={busy}
                onPress={() => void more()}
                style={{ minHeight: 44, padding: 16 }}
                accessibilityRole="button"
              >
                <Text style={{ color: colors.brandLight }}>{busy ? "Loading…" : "Load more activity"}</Text>
              </TouchableOpacity>
            ) : undefined
          }
          renderItem={({ item, index }) => {
            const day = activityDay(item.updatedAt);
            const previous = items[index - 1];
            const showDay = !previous || activityDay(previous.updatedAt) !== day;
            const itemRead = isRead(item);
            return (
              <View>
                {showDay && (
                  <Text
                    accessibilityRole="header"
                    style={[
                      typography.subhead,
                      { color: colors.text, marginTop: index === 0 ? 4 : 16, marginBottom: 8, fontWeight: "700" },
                    ]}
                  >
                    {day}
                  </Text>
                )}
                <View
                  style={{
                    backgroundColor: itemRead ? colors.surface : colors.surfaceElevated,
                    padding: 12,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: itemRead ? colors.border : colors.brandMuted,
                    borderLeftWidth: itemRead ? 1 : 3,
                    borderLeftColor: itemRead ? colors.border : colors.brandLight,
                    marginBottom: 8,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Review ${item.title}`}
                    onPress={() => {
                      handleMarkItemRead(item.id);
                      const [owner = "owner", repo = "repo"] = item.repo.split("/");
                      router.push(`/pr/${owner}/${repo}/${item.number}`);
                    }}
                    android_ripple={androidRipple()}
                    style={({ pressed }) => [{ flex: 1, flexDirection: "row", gap: 10, alignItems: "flex-start" }, pressed && { opacity: 0.88 }]}
                  >
                    <Avatar login={item.actor ?? item.author} size={30} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Text style={[typography.code, { color: colors.textSecondary, fontSize: 11, flex: 1 }]}>
                          {item.repo} · #{item.number}
                        </Text>
                        <Text style={[typography.caption, { color: colors.textSecondary }]}>
                          {relativeTime(item.updatedAt)}
                        </Text>
                        {!itemRead && (
                          <View
                            accessibilityLabel="Unread"
                            style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.statusAlert }}
                          />
                        )}
                      </View>
                      <Text style={[typography.subhead, { color: colors.text, fontWeight: "600", marginTop: 3 }]} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>
                        <Text style={{ fontWeight: "600", color: colors.text }}>
                          {item.event ? (item.actor ? `@${item.actor}` : "Actor unavailable") : `@${item.author}`}
                        </Text>{" "}
                        {item.event ? `· ${item.event} event` : activityAction(item.kind)}
                      </Text>
                      {!!item.summaryLine && (
                        <Text style={[typography.footnote, { color: colors.textSecondary, marginTop: 4 }]} numberOfLines={2}>
                          {item.summaryLine}
                        </Text>
                      )}
                      <View style={{ flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
                        {item.status && !item.event && <StatusPill status={item.status} />}
                        {item.risk && <RiskBadge level={item.risk} compact />}
                      </View>
                    </View>
                  </Pressable>

                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    {!itemRead ? (
                      <CompactControl
                        accessibilityLabel={`Mark ${item.title} as read`}
                        onPress={() => handleMarkItemRead(item.id)}
                        isDesktop={isDesktop}
                        variant="icon"
                        contentStyle={{
                          backgroundColor: colors.statusGoodBg,
                          borderWidth: 1,
                          borderColor: colors.statusGood,
                        }}
                      >
                        <Icon name="checkmark" size={density.icon.iconSize} color={colors.statusGood} />
                      </CompactControl>
                    ) : (
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <Icon name="checkmark-done" size={12} color={colors.textMuted} />
                        <Text style={[typography.caption, { color: colors.textMuted, fontSize: 10 }]}>Read</Text>
                      </View>
                    )}
                    <Icon name="chevron-forward" size={15} color={colors.textMuted} />
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  topBentoControls: {
    paddingVertical: 4,
    gap: 8,
  },
  desktopToolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modeGroup: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 2,
  },
  filterScroller: { flexGrow: 0 },
  chipsRow: {
    flexDirection: "row",
    gap: 6,
  },
});
