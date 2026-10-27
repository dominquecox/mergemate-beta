import React, { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { useTheme } from "../../src/context/ThemeContext";
import { api } from "../../src/api";
import { toUserMessage } from "../../src/api/errors";
import { TriageItem, TriageLane } from "../../src/types";
import { Header } from "../../src/components/Header";
import { Card } from "../../src/components/Card";
import { Button } from "../../src/components/Button";
import { EmptyState } from "../../src/components/EmptyState";
import { ErrorState } from "../../src/components/ErrorState";

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
      setError(toUserMessage(e, "Failed to load triage queue."));
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
            <TouchableOpacity onPress={handleUndo} accessibilityLabel="Undo last triage choice">
              <Text style={[typography.subhead, { color: colors.brandLight, fontWeight: "600" }]}>Undo</Text>
            </TouchableOpacity>
          ) : undefined
        }
      />

      {/* Progress Bar */}
      <View style={[styles.progressTrack, { backgroundColor: colors.surfaceSecondary }]}>
        <View
          style={[
            styles.progressBar,
            { backgroundColor: colors.brand, width: `${Math.min(100, Math.max(0, progressPercent))}%` },
          ]}
        />
      </View>

      <View style={[styles.content, { padding: spacing.base }]}>
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.brandLight} />
            <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.md }]}>
              Analyzing triage queue...
            </Text>
          </View>
        ) : error ? (
          <ErrorState message={error} onRetry={loadQueue} />
        ) : !currentItem ? (
          <EmptyState
            icon="✨"
            title="All Caught Up!"
            message={`You've triaged all ${totalCount} pull requests. Great job staying on top of code review.`}
            actionTitle="Reset Deck"
            onAction={loadQueue}
          />
        ) : (
          <View style={styles.deckContainer}>
            <Text style={[typography.caption, { color: colors.textMuted, marginBottom: 8 }]}>
              QUEUE {processedCount + 1} OF {totalCount}
            </Text>

            <Card style={styles.triageCard}>
              <View style={styles.cardHeader}>
                <Text style={[typography.caption, { color: colors.brandLight, fontFamily: "monospace" }]}>
                  {currentItem.prRef}
                </Text>
                <View style={[styles.lanePill, { backgroundColor: colors.brandSubtle }]}>
                  <Text style={[typography.caption, { color: colors.brandLight, fontWeight: "700" }]}>
                    SUGGESTED: {currentItem.lane.replace("_", " ").toUpperCase()}
                  </Text>
                </View>
              </View>

              <Text style={[typography.title2, { color: colors.text, marginTop: spacing.md }]}>
                {currentItem.title ?? currentItem.prRef.split("#")[0]}
              </Text>

              <View style={[styles.reasonBox, { backgroundColor: colors.surfaceElevated, borderRadius: radius.md, marginTop: spacing.md }]}>
                <Text style={[typography.subhead, { color: colors.textSecondary }]}>
                  💡 {currentItem.reason}
                </Text>
              </View>

              <Text style={[typography.footnote, { color: colors.textMuted, marginTop: spacing.lg }]}>
                Choose a lane below to sort this PR instantly:
              </Text>

              {/* Triage Action Buttons */}
              <View style={[styles.actions, { marginTop: spacing.md }]}>
                <Button
                  title="Needs you"
                  onPress={() => handleDecision("needs_you")}
                  style={{ backgroundColor: colors.laneNeedsYou, width: "100%" }}
                />
                <Button
                  title="FYI (Read Later)"
                  onPress={() => handleDecision("fyi")}
                  style={{ backgroundColor: colors.laneFyi, width: "100%", marginTop: spacing.sm }}
                />
                <Button
                  title="Ignore / Mute"
                  onPress={() => handleDecision("ignore")}
                  variant="secondary"
                  style={{ width: "100%", marginTop: spacing.sm }}
                />
              </View>
            </Card>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
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
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
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
