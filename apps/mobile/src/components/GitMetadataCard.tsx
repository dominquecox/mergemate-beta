import React, { useState } from "react";
import { View, StyleSheet, TouchableOpacity, Platform, Share } from "react-native";
import { Text } from "./Text";
import { Icon } from "./Icon";
import { Avatar } from "./Avatar";
import { useTheme } from "../context/ThemeContext";
import { relativeTime } from "../format/activity";
import { formatCommitSha, formatDiffStat, formatFileCount } from "../workspace/gitMetadata";

export interface GitMetadataProps {
  baseBranch: string;
  headBranch: string;
  headSha?: string;
  author: string;
  createdAt: string;
  additions: number;
  deletions: number;
  fileCount?: number;
}

export function GitMetadataCard({
  baseBranch,
  headBranch,
  headSha,
  author,
  createdAt,
  additions,
  deletions,
  fileCount,
}: GitMetadataProps) {
  const { colors, typography, radius, spacing } = useTheme();
  const [copied, setCopied] = useState(false);

  const handleCopySha = async () => {
    if (!headSha) return;
    if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(headSha);
    } else {
      try {
        await Share.share({ message: headSha });
      } catch {
        // Fallback or dismissed
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shortSha = formatCommitSha(headSha);
  const diff = formatDiffStat(additions, deletions);
  const formattedFiles = formatFileCount(fileCount);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surfaceElevated,
          borderColor: colors.border,
          borderRadius: radius.md,
          padding: spacing.md,
        },
      ]}
      accessibilityRole="summary"
      accessibilityLabel={`Git metadata: base ${baseBranch}, head ${headBranch}, authored by ${author}`}
    >
      {/* Branch Lineage: Base <- Head */}
      <View style={styles.branchRow}>
        <View
          style={[
            styles.branchPill,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: radius.full,
            },
          ]}
        >
          <Icon name="git-branch-outline" size={13} color={colors.textSecondary} />
          <Text style={[typography.code, { color: colors.textSecondary, fontSize: 12 }]} numberOfLines={1}>
            {baseBranch}
          </Text>
        </View>

        <Icon name="arrow-back" size={13} color={colors.textMuted} />

        <View
          style={[
            styles.branchPill,
            {
              backgroundColor: colors.brandSubtle,
              borderColor: colors.borderLight,
              borderRadius: radius.full,
              maxWidth: "60%",
            },
          ]}
        >
          <Icon name="git-pull-request-outline" size={13} color={colors.brandLight} />
          <Text
            style={[
              typography.code,
              { color: colors.brandLight, fontSize: 12, fontWeight: "600", flexShrink: 1 },
            ]}
            numberOfLines={1}
          >
            {headBranch}
          </Text>
        </View>
      </View>

      {/* Metrics Strip: Author · Diff Stats · Commit SHA */}
      <View style={[styles.metaStrip, { borderTopColor: colors.border, marginTop: spacing.sm, paddingTop: spacing.sm }]}>
        <View style={styles.authorGroup}>
          <Avatar login={author} size={20} />
          <Text style={[typography.footnote, { color: colors.textSecondary }]}>
            @{author} · {relativeTime(createdAt)}
          </Text>
        </View>

        <View style={styles.statsGroup}>
          {formattedFiles && (
            <View style={styles.statItem}>
              <Icon name="document-text-outline" size={13} color={colors.textMuted} />
              <Text style={[typography.code, { color: colors.textMuted, fontSize: 12 }]}>
                {formattedFiles}
              </Text>
            </View>
          )}

          <View style={styles.diffPill}>
            <Text style={[typography.code, { color: colors.riskLow, fontSize: 12, fontWeight: "600" }]}>
              {diff.added}
            </Text>
            <Text style={[typography.code, { color: colors.riskHigh, fontSize: 12, fontWeight: "600" }]}>
              {diff.deleted}
            </Text>
          </View>

          {shortSha && (
            <TouchableOpacity
              onPress={handleCopySha}
              accessibilityRole="button"
              accessibilityLabel={copied ? "Commit SHA copied" : `Copy commit SHA ${shortSha}`}
              style={[
                styles.shaBtn,
                {
                  backgroundColor: copied ? colors.riskLowBg : colors.surface,
                  borderColor: copied ? colors.riskLow : colors.border,
                  borderRadius: radius.sm,
                },
              ]}
            >
              <Icon
                name={copied ? "checkmark-outline" : "git-commit-outline"}
                size={12}
                color={copied ? colors.riskLow : colors.textSecondary}
              />
              <Text
                style={[
                  typography.code,
                  { color: copied ? colors.riskLow : colors.textSecondary, fontSize: 11 },
                ]}
              >
                {copied ? "Copied" : shortSha}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    marginVertical: 8,
  },
  branchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  branchPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderWidth: 1,
  },
  metaStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    flexWrap: "wrap",
    gap: 8,
  },
  authorGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statsGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  diffPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  shaBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderWidth: 1,
    minHeight: 28,
  },
});
