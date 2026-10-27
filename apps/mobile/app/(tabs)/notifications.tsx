import React, { useState, useEffect, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
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

export default function NotificationsScreen() {
  const { colors, typography, spacing, radius } = useTheme();

  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [items, setItems] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadNotifications = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getNotifications(filter);
      setItems(data);
    } catch (e) {
      setError(toUserMessage(e, "We couldn't load your notifications right now. Please try again."));
    } finally {
      setIsLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const markAllRead = () => {
    setItems((prev) => prev.map((item) => ({ ...item, read: true })));
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Header
        title="Notifications"
        rightAction={
          <TouchableOpacity
            onPress={markAllRead}
            style={styles.markReadBtn}
            accessibilityRole="button"
            accessibilityLabel="Mark all notifications as read"
          >
            <Text style={[typography.subhead, { color: colors.brandLight, fontWeight: "600" }]}>Mark all read</Text>
          </TouchableOpacity>
        }
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

      {/* Quiet Hours Banner (US-17) */}
      <View style={[styles.quietBanner, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
        <Text style={[typography.caption, { color: colors.textSecondary }]}>
          🌙 Quiet Hours active (22:00 – 08:00). High-priority review alerts will sound after 08:00.
        </Text>
      </View>

      {isLoading ? (
        <LoadingState
          title="Loading notifications..."
          message="Checking for recent pull request activity."
        />
      ) : error ? (
        <ErrorState
          title="Could not load notifications"
          message={error}
          onRetry={loadNotifications}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon="🔔"
          title="No Alerts"
          message="No notification events match your selected filter."
          actionTitle="Check Again"
          onAction={loadNotifications}
        />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.base, paddingBottom: 60 }}>
          {/* Grouped by Day */}
          <Text
            style={[typography.caption, { color: colors.textMuted, textTransform: "uppercase", marginBottom: 8 }]}
            accessibilityRole="header"
          >
            Today
          </Text>

          {items.map((item) => (
            <View
              key={item.id}
              style={[
                styles.notifCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderRadius: radius.md,
                },
              ]}
            >
              <View style={styles.notifHeader}>
                <View style={styles.leftMeta}>
                  {!item.read && (
                    <View
                      style={[styles.unreadDot, { backgroundColor: colors.brandLight }]}
                      accessibilityLabel="Unread"
                    />
                  )}
                  <Text style={[typography.caption, { color: colors.textMuted, fontFamily: "monospace" }]}>
                    {item.repo}
                  </Text>
                </View>
                {item.risk && <RiskBadge level={item.risk} compact />}
              </View>

              <Text style={[typography.headline, { color: colors.text, marginTop: 4 }]} numberOfLines={2}>
                {item.title}
              </Text>

              {item.summaryLine && (
                <Text style={[typography.footnote, { color: colors.textSecondary, marginTop: 4 }]} numberOfLines={2}>
                  {item.summaryLine}
                </Text>
              )}

              <View style={styles.notifFooter}>
                <StatusPill status={item.status} />
                <Text style={[typography.caption, { color: colors.textMuted }]}>
                  {new Date(item.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </Text>
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
