import {scanAgentGuardrails} from '../workspace/agentGuardrails';
import {AgentGuardrailAlert} from './AgentGuardrailAlert';
import type {PrFile} from '../types';
import React from "react";
import { View, StyleSheet, TouchableOpacity } from "react-native";
import { Text } from "./Text";
import { Icon } from "./Icon";
import { useTheme } from "../context/ThemeContext";
import type { ExecutiveVerdict } from "../workspace/executiveVerdict";
import type { AgentProvenance } from "../workspace/provenance";

interface ExecutiveVerdictCardProps {
  verdict: ExecutiveVerdict;
  files?:readonly PrFile[];
  totalFiles?:number;
  provenance?: AgentProvenance;
  hasVisualAssets?: boolean;
  onOpenVisualAudit?: () => void;
  riskiestFile?: string | null;
  onJumpToFile?: (file: string) => void;
  /** Strip form for the PR page: risk, one line of impact and the next step. Guardrails, reasons and the audit shortcut live on the Risk tab. */
  compact?: boolean;
  impact?: string;
  nextStep?: string;
}

export function ExecutiveVerdictCard({
  verdict:receivedVerdict,
  files=[],
  totalFiles,
  provenance,
  hasVisualAssets,
  onOpenVisualAudit,
  riskiestFile,
  onJumpToFile,
  compact = false,
  impact,
  nextStep,
}: ExecutiveVerdictCardProps) {
  const { colors, typography, radius, spacing } = useTheme();
  const findings=scanAgentGuardrails(files),high=findings.some(f=>f.severity==='high');
  const verdict:ExecutiveVerdict=high&&receivedVerdict.level!=='blocked'?{...receivedVerdict,level:'blocked',tone:'red',headline:'BLOCKED · AGENT GUARDRAILS ALERT',summary:'Security guardrail findings require human review.',reasons:findings.slice(0,2).map(f=>f.message),iconName:'shield-outline'}:findings.length&&receivedVerdict.level==='safe'?{...receivedVerdict,level:'caution',tone:'yellow',headline:'CAUTION · AGENT GUARDRAILS ALERT',summary:'Potential dependency or mock regression needs review.',reasons:findings.slice(0,2).map(f=>f.message),iconName:'warning'}:receivedVerdict;

  const isGreen = verdict.tone === "green";
  const isYellow = verdict.tone === "yellow";

  const toneColor = isGreen
    ? colors.riskLow
    : isYellow
      ? colors.riskMedium
      : colors.riskHigh;

  const toneBg = isGreen
    ? colors.riskLowBg
    : isYellow
      ? colors.riskMediumBg
      : colors.riskHighBg;

  const cardBorder = isGreen
    ? colors.border
    : isYellow
      ? "rgba(252, 211, 77, 0.35)"
      : "rgba(252, 165, 165, 0.4)";

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: cardBorder,
          borderRadius: radius.lg,
          borderLeftWidth: 4,
          borderLeftColor: toneColor,
        },
      ]}
      testID={verdict.level !== "safe" ? "risk-banner" : "executive-verdict-card"}
    >
      {/* Agent Provenance Badge */}
      {!compact && provenance?.isAgentAuthored && (
        <View
          style={[
            styles.provenancePill,
            {
              backgroundColor: colors.brandSubtle,
              borderColor: colors.border,
              borderRadius: radius.full,
              marginBottom: spacing.xs,
            },
          ]}
          testID="agent-provenance-badge"
        >
          <Icon name="hardware-chip-outline" size={13} color={colors.brandLight} />
          <Text
            style={[
              typography.caption,
              { color: colors.brandLight, fontWeight: "600" },
            ]}
          >
            {provenance.badgeLabel}
          </Text>
        </View>
      )}

      {!compact && <AgentGuardrailAlert files={files} agentAuthored={!!provenance?.isAgentAuthored} {...(totalFiles===undefined?{}:{total:totalFiles})}/>}
      {/* Verdict Header Row */}
      <View style={styles.verdictHeader}>
        <View
          style={[
            styles.iconWrapper,
            { backgroundColor: toneBg, borderRadius: radius.full },
          ]}
        >
          <Icon name={verdict.iconName} size={16} color={toneColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={[
              typography.caption,
              {
                color: toneColor,
                fontWeight: "700",
                letterSpacing: 0.8,
                textTransform: "uppercase",
              },
            ]}
          >
            {verdict.headline}
          </Text>
          <Text
            style={[
              typography.subhead,
              { color: colors.text, fontWeight: "600", marginTop: 2 },
            ]}
          >
            {verdict.summary}
          </Text>
        </View>
      </View>

      {compact && !!impact && (
        <Text style={[typography.footnote, { color: colors.textSecondary, marginTop: spacing.xs, lineHeight: 18 }]} numberOfLines={3}>
          {impact}
        </Text>
      )}
      {compact && !!nextStep && (
        <Text style={[typography.caption, { color: toneColor, fontWeight: "700", marginTop: spacing.xs }]} accessibilityLabel={nextStep}>
          {nextStep}
        </Text>
      )}

      {/* Rationale Bullet Points */}
      {!compact && verdict.reasons.length > 0 && (
        <View style={[styles.reasonsList, { marginTop: spacing.xs }]}>
          {verdict.reasons.map((reason, idx) => (
            <View key={idx} style={styles.reasonRow}>
              <View
                style={[
                  styles.bullet,
                  { backgroundColor: toneColor },
                ]}
              />
              <Text
                style={[
                  typography.footnote,
                  { color: colors.textSecondary, flex: 1, lineHeight: 18 },
                ]}
              >
                {reason}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Jump to Riskiest File */}
      {!compact && riskiestFile && onJumpToFile && verdict.level !== "safe" && (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={`Jump to riskiest file ${riskiestFile}`}
          onPress={() => onJumpToFile(riskiestFile)}
          style={[
            styles.actionRow,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.border,
              borderRadius: radius.md,
              marginTop: spacing.xs,
            },
          ]}
        >
          <Icon name="document-text-outline" size={14} color={toneColor} />
          <Text
            style={[
              typography.caption,
              { color: toneColor, fontWeight: "600", flex: 1 },
            ]}
            numberOfLines={1}
          >
            Inspect sensitive file: {riskiestFile}
          </Text>
          <Icon name="arrow-forward-outline" size={14} color={toneColor} />
        </TouchableOpacity>
      )}

      {/* Visual UI Audit Trigger (Meta SAM-3.1 Hero) */}
      {!compact && hasVisualAssets && onOpenVisualAudit && (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Run Meta SAM Visual UI Audit on screenshots"
          onPress={onOpenVisualAudit}
          style={[
            styles.actionRow,
            {
              backgroundColor: colors.brandSubtle,
              borderColor: colors.borderLight,
              borderRadius: radius.md,
              marginTop: spacing.xs,
            },
          ]}
          testID="visual-audit-banner"
        >
          <Icon name="image-outline" size={15} color={colors.brandLight} />
          <View style={{ flex: 1 }}>
            <Text
              style={[
                typography.caption,
                { color: colors.brandLight, fontWeight: "700" },
              ]}
            >
              Visual UI Audit Available (Meta SAM-3.1)
            </Text>
            <Text
              style={[
                typography.caption,
                { color: colors.textSecondary, fontSize: 11 },
              ]}
            >
              Audit mobile tap targets (&lt;44pt) and layout shifts
            </Text>
          </View>
          <Icon name="chevron-forward-outline" size={16} color={colors.brandLight} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 14,
    borderWidth: 1,
    marginTop: 8,
    marginBottom: 8,
  },
  provenancePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  verdictHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  iconWrapper: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  reasonsList: {
    gap: 4,
    paddingLeft: 38,
  },
  reasonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  bullet: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  actionRow: {
    minHeight: 44,
    minWidth: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
  },
});
