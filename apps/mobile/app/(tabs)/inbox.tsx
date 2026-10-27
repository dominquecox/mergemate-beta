import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
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

export default function InboxScreen() {
  const router = useRouter();
  const { colors, typography, spacing, radius } = useTheme();

  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [items, setItems] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [undoItem, setUndoItem] = useState<Notification | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      const data = await api.getNotifications(filter);
      setItems(data);
      setError(null);
    } catch (e) {
      setError(toUserMessage(e, "We couldn't load your inbox right now. Please try again."));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [filter]);

  useEffect(() => {
    setIsLoading(true);
    fetchItems();
  }, [fetchItems]);

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchItems();
  };

  // The card leaves the list at once; if the API refuses, it comes back and the reason is shown.
  const applyAction = async (item: Notification, action: () => Promise<void>) => {
    setUndoItem(item);
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    try {
      await action();
    } catch (e) {
      setUndoItem(null);
      setItems((prev) => [item, ...prev]);
      setError(toUserMessage(e, "Couldn't update that pull request."));
    }
  };

  const handleDone = (item: Notification) => applyAction(item, () => api.markNotificationDone(item.id));

  const handleSnooze = (item: Notification) =>
    applyAction(item, () => api.snoozeNotification(item.id, new Date(Date.now() + 86400000).toISOString()));

  const handleUndo = async () => {
    if (!undoItem) return;
    const item = undoItem;
    setUndoItem(null);
    setItems((prev) => [item, ...prev]);
    try {
      await api.restoreNotification(item.id);
    } catch (e) {
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      setError(toUserMessage(e, "Couldn't undo that."));
    }
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
        showLogo
        rightAction={
          <View style={styles.headerIcons}>
            <TouchableOpacity
              onPress={() => router.push("/search")}
              style={styles.iconBtn}
              accessibilityRole="button"
              accessibilityLabel="Search pull requests"
            >
              <Text style={{ fontSize: 18 }} accessibilityElementsHidden>
                🔍
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push("/highlight")}
              style={styles.iconBtn}
              accessibilityRole="button"
              accessibilityLabel="Highlight screenshot"
            >
              <Text style={{ fontSize: 18 }} accessibilityElementsHidden>
                📸
              </Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* Segmented Filter Control */}
      <View style={[styles.filterBar, { borderBottomColor: colors.border }]} accessibilityRole="tablist">
        {(["all", "review", "mentions", "mine"] as NotificationFilter[]).map((tab) => {
          const isSelected = filter === tab;
          let label = "All";
          if (tab === "review") label = "Review";
          if (tab === "mentions") label = "Mentions";
          if (tab === "mine") label = "Mine";

          return (
            <TouchableOpacity
              key={tab}
              onPress={() => setFilter(tab)}
              style={[
                styles.filterTab,
                {
                  backgroundColor: isSelected ? colors.surfaceInteractive : "transparent",
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
                    color: isSelected ? colors.text : colors.textSecondary,
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
            onPress={handleUndo}
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
      ) : error ? (
        <ErrorState
          title="Could not load your inbox"
          message={error}
          onRetry={fetchItems}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon="🎉"
          title="Inbox Zero"
          message="You're all caught up! No pull requests need your attention in this view."
          actionTitle="Refresh Inbox"
          onAction={fetchItems}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.base, paddingBottom: 80 }}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.brandLight} />}
        >
          {/* Summary Strip Card */}
          <View
            style={[styles.summaryStrip, { backgroundColor: colors.surfaceElevated, borderColor: colors.border, borderRadius: radius.md }]}
            accessibilityLabel={`Summary: ${items.filter((i) => i.kind === "review").length} needs you, ${items.filter((i) => i.kind === "mention").length} FYI, ${items.filter((i) => i.kind === "mine").length} mine`}
          >
            <View style={styles.stripCol}>
              <Text style={[typography.headline, { color: colors.laneNeedsYou }]}>
                {items.filter((i) => i.kind === "review").length}
              </Text>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>Needs you</Text>
            </View>
            <View style={styles.stripCol}>
              <Text style={[typography.headline, { color: colors.laneFyi }]}>
                {items.filter((i) => i.kind === "mention").length}
              </Text>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>FYI</Text>
            </View>
            <View style={styles.stripCol}>
              <Text style={[typography.headline, { color: colors.laneIgnore }]}>
                {items.filter((i) => i.kind === "mine").length}
              </Text>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>Mine</Text>
            </View>
          </View>

          {/* PR Items List */}
          {items.map((item) => (
            <View
              key={item.id}
              style={[
                styles.itemCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderRadius: radius.lg,
                  borderLeftColor: item.risk === "high" ? colors.riskHigh : colors.border,
                  borderLeftWidth: item.risk === "high" ? 4 : 1,
                },
              ]}
            >
              <TouchableOpacity
                onPress={() => navigateToPr(item)}
                activeOpacity={0.85}
                style={styles.cardMainTouch}
                accessibilityRole="button"
                accessibilityLabel={`Open pull request #${item.number}: ${item.title} in ${item.repo}, ${item.risk || "normal"} risk`}
              >
                <View style={styles.cardTop}>
                  <Text style={[typography.caption, { color: colors.textMuted, fontFamily: "monospace" }]}>
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
                  <View style={styles.summaryRow}>
                    <Text style={[typography.caption, { color: colors.brandLight }]} accessibilityElementsHidden>
                      ✦
                    </Text>
                    <Text style={[typography.footnote, { color: colors.textSecondary, flex: 1 }]} numberOfLines={2}>
                      {item.summaryLine}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>

              <View style={styles.cardBottom}>
                <Text style={[typography.caption, { color: colors.textMuted, flex: 1 }]}>
                  By @{item.author} · {new Date(item.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </Text>

                <View style={styles.quickActions}>
                  <TouchableOpacity
                    onPress={() => handleSnooze(item)}
                    style={[styles.actionBtn, { borderColor: colors.border }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Snooze ${item.title}`}
                  >
                    <Text style={[typography.caption, { color: colors.textSecondary, fontWeight: "600" }]}>Snooze</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDone(item)}
                    style={[styles.actionBtn, { borderColor: colors.border, backgroundColor: colors.surfaceInteractive }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Mark ${item.title} as done`}
                  >
                    <Text style={[typography.caption, { color: colors.text, fontWeight: "600" }]}>Done</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))}
        </ScrollView>
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
