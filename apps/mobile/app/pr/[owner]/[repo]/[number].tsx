import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Linking,
  Share,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useTheme } from "../../../../src/context/ThemeContext";
import { api } from "../../../../src/api";
import { PrDetail } from "../../../../src/types";
import { Header } from "../../../../src/components/Header";
import { StatusPill } from "../../../../src/components/StatusPill";
import { RiskBadge } from "../../../../src/components/RiskBadge";
import { AIBlock } from "../../../../src/components/AIBlock";
import { Button } from "../../../../src/components/Button";
import { ErrorState } from "../../../../src/components/ErrorState";

export default function PrDetailScreen() {
  const { owner, repo, number } = useLocalSearchParams<{
    owner: string;
    repo: string;
    number: string;
  }>();

  const { colors, typography, spacing, radius } = useTheme();

  const [detail, setDetail] = useState<PrDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [newNote, setNewNote] = useState("");

  const loadPr = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getPrDetail(owner || "owner", repo || "repo", parseInt(number || "1", 10));
      setDetail(data);
    } catch (e: any) {
      setError(e.message || "Failed to load pull request detail.");
    } finally {
      setIsLoading(false);
    }
  }, [owner, repo, number]);

  useEffect(() => {
    loadPr();
  }, [loadPr]);

  const handleShare = async () => {
    if (detail) {
      await Share.share({
        message: `${detail.title} (${detail.owner}/${detail.repo}#${detail.number})\n${detail.htmlUrl}`,
      });
    }
  };

  const openInGitHub = () => {
    if (detail?.htmlUrl) {
      Linking.openURL(detail.htmlUrl);
    }
  };

  const addLocalNote = () => {
    if (newNote.trim()) {
      setNotes((prev) => [...prev, newNote.trim()]);
      setNewNote("");
      setShowNoteModal(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Header
        title={`${repo}#${number}`}
        showBack
        rightAction={
          <TouchableOpacity onPress={handleShare} accessibilityLabel="Share pull request">
            <Text style={{ fontSize: 18 }}>📤</Text>
          </TouchableOpacity>
        }
      />

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.brandLight} />
          <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.md }]}>
            Loading review analysis...
          </Text>
        </View>
      ) : error || !detail ? (
        <ErrorState message={error || "PR not found."} onRetry={loadPr} />
      ) : (
        <>
          <ScrollView contentContainerStyle={{ padding: spacing.base, paddingBottom: 100 }}>
            {/* PR Header */}
            <View style={[styles.headerCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg }]}>
              <View style={styles.topRow}>
                <Text style={[typography.caption, { color: colors.textMuted, fontFamily: "monospace" }]}>
                  {detail.owner}/{detail.repo} · #{detail.number}
                </Text>
                <StatusPill status={detail.status} />
              </View>

              <Text style={[typography.title2, { color: colors.text, marginTop: spacing.xs }]}>
                {detail.title}
              </Text>

              <View style={styles.metaRow}>
                <Text style={[typography.caption, { color: colors.textSecondary }]}>
                  By @{detail.author} · {detail.headBranch} → {detail.baseBranch}
                </Text>
                <Text style={[typography.caption, { color: colors.textMuted }]}>
                  +{detail.additions} -{detail.deletions} ({detail.changedFilesCount} files)
                </Text>
              </View>
            </View>

            {/* US-25: Secret Leak Warning Banner */}
            {detail.secretWarning && (
              <View
                style={[
                  styles.secretBanner,
                  {
                    backgroundColor: colors.secretWarningBg,
                    borderColor: colors.secretWarning,
                    borderRadius: radius.md,
                    marginTop: spacing.sm,
                  },
                ]}
                accessibilityRole="alert"
              >
                <View style={styles.secretTitleRow}>
                  <Text style={[styles.warningIcon, { color: colors.secretWarning }]}>⚠</Text>
                  <Text style={[typography.headline, { color: colors.secretWarning, fontWeight: "700" }]}>
                    POSSIBLE SECRET DETECTED
                  </Text>
                </View>
                <Text style={[typography.footnote, { color: "#FFFFFF", marginTop: 4, lineHeight: 18 }]}>
                  Pattern matched {detail.secretWarning.rule} at {detail.secretWarning.file}:
                  {detail.secretWarning.line}. Raw secret values are always masked and never sent to AI.
                </Text>
                <View style={[styles.codeBox, { backgroundColor: "rgba(0,0,0,0.4)", borderRadius: radius.sm, marginTop: 6 }]}>
                  <Text style={[typography.code, { color: "#FEE2E2" }]}>
                    {detail.secretWarning.maskedSnippet}
                  </Text>
                </View>
              </View>
            )}

            {/* AI Summary Card (US-09) */}
            {detail.summary && (
              <View style={{ marginTop: spacing.sm }}>
                <AIBlock title="AI PR Summary" coverage={detail.summary.coverage} cachedTime="cached · 2m ago">
                  <Text style={[typography.subhead, { color: colors.brandLight, fontWeight: "600" }]}>
                    What Changed
                  </Text>
                  <Text style={[typography.body, { color: colors.text, marginTop: 2 }]}>
                    {detail.summary.whatChanged}
                  </Text>

                  <Text style={[typography.subhead, { color: colors.brandLight, fontWeight: "600", marginTop: 8 }]}>
                    Why It Matters
                  </Text>
                  <Text style={[typography.body, { color: colors.text, marginTop: 2 }]}>
                    {detail.summary.whyItMatters}
                  </Text>

                  <Text style={[typography.subhead, { color: colors.brandLight, fontWeight: "600", marginTop: 8 }]}>
                    Suggested Focus
                  </Text>
                  {detail.summary.suggestedFocus.map((focus: string, idx: number) => (
                    <Text key={idx} style={[typography.footnote, { color: colors.textSecondary, marginTop: 2 }]}>
                      • {focus}
                    </Text>
                  ))}
                </AIBlock>
              </View>
            )}

            {/* Risk Assessment Card (US-10) */}
            {detail.risk && (
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, marginTop: spacing.sm }]}>
                <View style={styles.riskHeader}>
                  <Text style={[typography.headline, { color: colors.text }]}>Risk Assessment</Text>
                  <RiskBadge level={detail.risk.level} secretWarning={detail.secretWarning} />
                </View>

                <View style={{ marginTop: spacing.sm }}>
                  {detail.risk.reasons.map((reason: string, idx: number) => (
                    <View key={idx} style={styles.reasonRow}>
                      <Text style={{ color: detail.risk!.level === "high" ? colors.riskHigh : colors.riskMedium }}>
                        ●
                      </Text>
                      <Text style={[typography.body, { color: colors.text, flex: 1 }]}>{reason}</Text>
                    </View>
                  ))}
                </View>

                <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.sm }]}>
                  How assessed: Evaluated against sensitive file boundaries, migrations, auth middleware, and secret patterns.
                </Text>
              </View>
            )}

            {/* CI Checks List */}
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, marginTop: spacing.sm }]}>
              <Text style={[typography.headline, { color: colors.text }]}>
                Checks ({detail.checks.filter((c) => c.conclusion === "success").length}/{detail.checks.length})
              </Text>
              <View style={{ marginTop: spacing.xs }}>
                {detail.checks.map((chk) => (
                  <View key={chk.id} style={styles.checkRow}>
                    <Text style={{ color: chk.conclusion === "success" ? colors.riskLow : colors.riskHigh }}>
                      {chk.conclusion === "success" ? "✓" : "✕"}
                    </Text>
                    <Text style={[typography.subhead, { color: colors.text, flex: 1 }]}>{chk.name}</Text>
                    <Text style={[typography.caption, { color: colors.textMuted }]}>{chk.conclusion}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Changed Files List */}
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, marginTop: spacing.sm }]}>
              <Text style={[typography.headline, { color: colors.text }]}>
                Files Changed ({detail.files.length})
              </Text>
              <View style={{ marginTop: spacing.xs }}>
                {detail.files.map((file, idx) => (
                  <View key={idx} style={[styles.fileRow, { borderBottomColor: colors.border, borderBottomWidth: idx === detail.files.length - 1 ? 0 : 1 }]}>
                    <Text style={[typography.code, { color: colors.text, flex: 1 }]} numberOfLines={1}>
                      {file.filename}
                    </Text>
                    <Text style={[typography.caption, { color: colors.riskLow }]}>+{file.additions}</Text>
                    <Text style={[typography.caption, { color: colors.riskHigh }]}>-{file.deletions}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Local Notes */}
            {notes.length > 0 && (
              <View style={[styles.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.border, borderRadius: radius.lg, marginTop: spacing.sm }]}>
                <Text style={[typography.headline, { color: colors.text }]}>My Notes</Text>
                {notes.map((note, idx) => (
                  <Text key={idx} style={[typography.body, { color: colors.textSecondary, marginTop: 4 }]}>
                    • {note}
                  </Text>
                ))}
              </View>
            )}
          </ScrollView>

          {/* Bottom Bar: Open in GitHub and Add note. STRICTLY NO MERGE, APPROVE, OR COMMENT CONTROLS ON GITHUB (US-12) */}
          <View style={[styles.bottomBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
            <Button
              title="Add Note"
              onPress={() => {
                const note = prompt("Enter note for this PR:") || "";
                if (note.trim()) setNotes((prev) => [...prev, note.trim()]);
              }}
              variant="secondary"
              style={{ flex: 1 }}
            />
            <Button
              title="Open in GitHub ↗"
              onPress={openInGitHub}
              variant="primary"
              style={{ flex: 2 }}
            />
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCard: {
    padding: 16,
    borderWidth: 1,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(128,128,128,0.2)",
  },
  secretBanner: {
    padding: 14,
    borderWidth: 1,
  },
  secretTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  warningIcon: {
    fontSize: 16,
    fontWeight: "700",
  },
  codeBox: {
    padding: 8,
  },
  card: {
    padding: 16,
    borderWidth: 1,
  },
  riskHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  reasonRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 4,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
  },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    padding: 16,
    borderTopWidth: 1,
    gap: 12,
  },
});
