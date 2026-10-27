import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "../../src/context/ThemeContext";
import { api } from "../../src/api";
import { Notification, NotificationFilter } from "../../src/types";
import { Header } from "../../src/components/Header";
import { RiskBadge } from "../../src/components/RiskBadge";
import { StatusPill } from "../../src/components/StatusPill";
import { EmptyState } from "../../src/components/EmptyState";
import { ErrorState } from "../../src/components/ErrorState";

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
    } catch (e: any) {
      setError(e.message || "Could not fetch inbox items.");
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

  const handleDone = async (item: Notification) => {
    setUndoItem(item);
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    await api.markNotificationDone(item.id);
  };

  const handleSnooze = async (item: Notification) => {
    setUndoItem(item);
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    await api.snoozeNotification(item.id, new Date(Date.now() + 86400000).toISOString());
  };

  const handleUndo = () => {
    if (undoItem) {
      setItems((prev) => [undoItem, ...prev]);
      setUndoItem(null);
    }
  };

  const navigateToPr = (item: Notification) => {
    const parts = item.repo.split("/");
    const owner = parts[0] || "owner";
    const repoName = parts[1] || "repo";
    // Match number from title or fallback
    const match = item.title.match(/#(\d+)/);
    const prNumber = match ? match[1] : "7";
    router.push(`/pr/${owner}/${repoName}/${prNumber}`);
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
              accessibilityLabel="Search pull requests"
            >
              <Text style={{ fontSize: 18 }}>🔍</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push("/highlight")}
              style={styles.iconBtn}
              accessibilityLabel="Highlight screenshot"
            >
              <Text style={{ fontSize: 18 }}>📸</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* Segmented Filter Control */}
      <View style={[styles.filterBar, { borderBottomColor: colors.border }]}>
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
        <View style={[styles.undoToast, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
          <Text style={[typography.footnote, { color: colors.text }]}>Item moved out of inbox</Text>
          <TouchableOpacity onPress={handleUndo}>
            <Text style={[typography.footnote, { color: colors.brandLight, fontWeight: "700" }]}>Undo</Text>
          </TouchableOpacity>
        </View>
      )}

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.brandLight} />
        </View>
      ) : error ? (
        <ErrorState message={error} onRetry={fetchItems} />
      ) : items.length === 0 ? (
        <EmptyState
          icon="🎉"
          title="Inbox Zero"
          message="You're all caught up! No pull requests require your attention right now."
          actionTitle="Refresh"
          onAction={fetchItems}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.base, paddingBottom: 80 }}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.brandLight} />}
        >
          {/* Summary Strip Card */}
          <View style={[styles.summaryStrip, { backgroundColor: colors.surfaceElevated, borderColor: colors.border, borderRadius: radius.md }]}>
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
            <TouchableOpacity
              key={item.id}
              onPress={() => navigateToPr(item)}
              activeOpacity={0.85}
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
              accessibilityRole="button"
              accessibilityLabel={`Pull request ${item.title} in ${item.repo}`}
            >
              <View style={styles.cardTop}>
                <Text style={[typography.caption, { color: colors.textMuted, fontFamily: "monospace" }]}>
                  {item.repo}
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
                  <Text style={[typography.caption, { color: colors.brandLight }]}>✦</Text>
                  <Text style={[typography.footnote, { color: colors.textSecondary, flex: 1 }]} numberOfLines={2}>
                    {item.summaryLine}
                  </Text>
                </View>
              )}

              <View style={styles.cardBottom}>
                <Text style={[typography.caption, { color: colors.textMuted }]}>
                  By @{item.author} · {new Date(item.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </Text>

                <View style={styles.quickActions}>
                  <TouchableOpacity
                    onPress={() => handleSnooze(item)}
                    style={[styles.actionBtn, { borderColor: colors.border }]}
                    accessibilityLabel="Snooze"
                  >
                    <Text style={[typography.caption, { color: colors.textSecondary }]}>Snooze</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDone(item)}
                    style={[styles.actionBtn, { borderColor: colors.border, backgroundColor: colors.surfaceInteractive }]}
                    accessibilityLabel="Done"
                  >
                    <Text style={[typography.caption, { color: colors.text, fontWeight: "600" }]}>Done</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
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
    gap: 8,
  },
  iconBtn: {
    padding: 6,
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
    paddingVertical: 6,
    alignItems: "center",
  },
  center: {
    flex: 1,
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
    gap: 6,
  },
  actionBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderRadius: 4,
  },
  undoToast: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 6,
  },
});
