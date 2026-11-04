import React, { useEffect, useMemo, useState } from "react";
import { View, Pressable, ScrollView, Modal } from "react-native";
import { useRouter } from "expo-router";
import { Text } from "./Text";
import { Icon, type IconName } from "./Icon";
import { InfoTip } from "./InfoTip";
import { useTheme } from "../context/ThemeContext";
import { useAlerts } from "../context/AlertsContext";
import { useLayout } from "../layout/useLayout";
import { api } from "../api";
import type { Notification, Repo } from "../types";
import { AGENT_TEMPLATES } from "../workflows/agent-model";

export interface InboxOverviewProps {
  count: number;
  needsReview: number;
  items?: Notification[];
}

interface TargetOption {
  key: string;
  label: string;
  sublabel: string;
  url: string;
  kind: "pr" | "repo";
}

/** Every shortcut opens an existing capability; dropdowns let the user pick from their actual loaded PRs and watched repositories. */
export function InboxOverview({ count, needsReview, items = [] }: InboxOverviewProps) {
  const { colors, typography, radius } = useTheme();
  const { isDesktop } = useLayout();
  const { unreadCount } = useAlerts();
  const router = useRouter();

  const [repos, setRepos] = useState<Repo[]>([]);
  const [selectedTargetUrl, setSelectedTargetUrl] = useState<string>("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(AGENT_TEMPLATES[0]?.id ?? "review");
  const [targetPickerOpen, setTargetPickerOpen] = useState(false);
  const [actionPickerOpen, setActionPickerOpen] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .getRepos()
      .then((list) => {
        if (active) setRepos(list.filter((r) => r.watching !== false));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const targetOptions = useMemo<TargetOption[]>(() => {
    const out: TargetOption[] = [];
    const seen = new Set<string>();
    for (const item of items) {
      const url = `https://github.com/${item.repo}/pull/${item.number}`;
      if (seen.has(url)) continue;
      seen.add(url);
      out.push({
        key: `pr:${item.id}`,
        label: `${item.repo} #${item.number}`,
        sublabel: item.title,
        url,
        kind: "pr",
      });
    }
    for (const repo of repos) {
      const url = `https://github.com/${repo.fullName}`;
      if (seen.has(url)) continue;
      seen.add(url);
      out.push({
        key: `repo:${repo.id}`,
        label: repo.fullName,
        sublabel: repo.private ? "Private repository · Code fix target" : "Public repository · Code fix target",
        url,
        kind: "repo",
      });
    }
    return out;
  }, [items, repos]);

  // Default to the first real PR/repo when available
  const activeTarget = useMemo(() => {
    if (selectedTargetUrl) {
      const match = targetOptions.find((t) => t.url === selectedTargetUrl);
      if (match) return match;
    }
    return targetOptions[0] ?? null;
  }, [selectedTargetUrl, targetOptions]);

  const activeTemplate = useMemo(
    () => AGENT_TEMPLATES.find((t) => t.id === selectedTemplateId) ?? AGENT_TEMPLATES[0]!,
    [selectedTemplateId],
  );

  const actions: { label: string; detail: string; icon: IconName; badge?: number; help: string; run: () => void }[] = [
    {
      label: "Find a PR",
      detail: "Search repos & pulls",
      icon: "search-outline",
      help: "Search across all accessible pull requests by repository, author, status, or keyword.",
      run: () => router.push("/search"),
    },
    {
      label: "Triage deck",
      detail: "Fast priority sweep",
      icon: "layers-outline",
      help: "Rapidly sort incoming pull requests into Needs You, FYI, or Ignore using keyboard shortcuts or swipe gestures.",
      run: () => router.push("/(tabs)/triage"),
    },
    {
      label: "Workflows",
      detail: "Visual agent workflows",
      icon: "git-network-outline",
      help: "Open the Agent Workflow Studio to build, customize, and execute multi-step review and coding workflows.",
      run: () => router.push("/workflows"),
    },
    {
      label: "Your alerts",
      detail: unreadCount > 0 ? `${unreadCount} unread alerts` : "Mentions & activity",
      icon: "notifications-outline",
      badge: unreadCount,
      help: "Inspect your active pull request notifications and 7-day repository webhook event history.",
      run: () => router.push("/(tabs)/notifications"),
    },
  ];

  const openWorkflowBuilder = (overrideMode?: "review" | "code_fix", overrideTemplateId?: string) => {
    const template = overrideTemplateId
      ? (AGENT_TEMPLATES.find((t) => t.id === overrideTemplateId) ?? activeTemplate)
      : activeTemplate;
    const mode = overrideMode ?? template.mode;
    const params: Record<string, string> = {
      mode,
      template: template.id,
    };
    if (activeTarget?.url) {
      params.target = activeTarget.url;
    }
    router.push({ pathname: "/workflows", params });
  };

  const heroCard = (
    <View
      style={{
        flex: isDesktop ? 7 : undefined,
        padding: isDesktop ? 18 : 14,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.brandMuted,
        backgroundColor: colors.brandSubtle,
        justifyContent: "space-between",
        gap: 10,
      }}
    >
      <View style={{ gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View
              style={{
                flexDirection: "row",
                gap: 5,
                alignItems: "center",
                backgroundColor: colors.surface,
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: colors.brandMuted,
              }}
            >
              <Icon name="sparkles" size={11} color={colors.brandLight} />
              <Text style={[typography.code, { color: colors.brandLight, fontSize: 10, letterSpacing: 1 }]}>
                MERGEMATE AI
              </Text>
            </View>
            <InfoTip
              title="Automated Workflow Launcher"
              body="Select any pull request or repository from your connected projects and choose the automation workflow to run. MergeMate pre-configures the visual node graph with your chosen target."
            />
          </View>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 999,
              backgroundColor: needsReview > 0 ? colors.statusWarningBg : colors.statusGoodBg,
              borderWidth: 1,
              borderColor: needsReview > 0 ? colors.statusWarning : colors.statusGood,
            }}
          >
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: needsReview > 0 ? colors.statusWarning : colors.statusGood,
              }}
            />
            <Text
              style={[
                typography.caption,
                {
                  color: needsReview > 0 ? colors.statusWarning : colors.statusGood,
                  fontWeight: "700",
                  fontSize: 10,
                },
              ]}
            >
              {count} loaded · {needsReview} needs review
            </Text>
          </View>
        </View>
        <Text
          accessibilityRole="header"
          style={[isDesktop ? typography.title2 : typography.headline, { color: colors.text, marginTop: 2 }]}
        >
          What would you like to automate today?
        </Text>
        <Text style={[typography.caption, { color: colors.textSecondary }]}>
          Select a pull request or repository from your projects and pick an agent workflow action.
        </Text>
      </View>

      {/* Structured Dropdown Selectors (Target PR/Repo + Workflow Action + Launch Button) */}
      <View
        style={{
          flexDirection: isDesktop ? "row" : "column",
          alignItems: "stretch",
          gap: 8,
        }}
      >
        {/* Dropdown 1: Select User's Actual PR or Repo */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Select pull request or repository to automate"
          onPress={() => setTargetPickerOpen(true)}
          style={({ pressed }) => ({
            flex: isDesktop ? 1.3 : undefined,
            minHeight: 42,
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 10,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.brandMuted,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Icon
            name={activeTarget?.kind === "repo" ? "folder-outline" : "git-pull-request-outline"}
            size={15}
            color={colors.brandLight}
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[typography.caption, { color: colors.textMuted, fontSize: 10 }]}>
              TARGET PR / REPOSITORY
            </Text>
            <Text numberOfLines={1} style={[typography.caption, { color: colors.text, fontWeight: "700" }]}>
              {activeTarget
                ? `${activeTarget.label} — ${activeTarget.sublabel}`
                : "Select a PR or repository..."}
            </Text>
          </View>
          <Icon name="chevron-down" size={14} color={colors.textSecondary} />
        </Pressable>

        {/* Dropdown 2: Select Automation Action */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Select workflow automation action"
          onPress={() => setActionPickerOpen(true)}
          style={({ pressed }) => ({
            flex: isDesktop ? 1 : undefined,
            minHeight: 42,
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 10,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Icon name={activeTemplate.icon as IconName} size={15} color={colors.statusInfo} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[typography.caption, { color: colors.textMuted, fontSize: 10 }]}>
              AUTOMATION ACTION
            </Text>
            <Text numberOfLines={1} style={[typography.caption, { color: colors.text, fontWeight: "700" }]}>
              {activeTemplate.name}
            </Text>
          </View>
          <Icon name="chevron-down" size={14} color={colors.textSecondary} />
        </Pressable>

        {/* Launch Button */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open agent workflows"
          onPress={() => openWorkflowBuilder()}
          style={({ pressed }) => ({
            minHeight: 42,
            paddingHorizontal: 14,
            borderRadius: 10,
            backgroundColor: colors.brand,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text style={[typography.caption, { color: "#FFFFFF", fontWeight: "700" }]}>Automate</Text>
          <Icon name="arrow-forward" size={15} color="#FFFFFF" />
        </Pressable>
      </View>

      {/* Quick Preset Pills */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Build PR review workflow"
          onPress={() => openWorkflowBuilder("review", "review")}
          style={({ pressed }) => ({
            minHeight: 30,
            paddingHorizontal: 9,
            paddingVertical: 4,
            borderRadius: 8,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Icon name="shield-checkmark-outline" size={12} color={colors.statusGood} />
          <Text style={[typography.caption, { color: colors.text, fontWeight: "600", fontSize: 11 }]}>
            PR Risk & QA Flow
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Build coding fix workflow"
          onPress={() => openWorkflowBuilder("code_fix", "fix")}
          style={({ pressed }) => ({
            minHeight: 30,
            paddingHorizontal: 9,
            paddingVertical: 4,
            borderRadius: 8,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Icon name="code-slash-outline" size={12} color={colors.brandLight} />
          <Text style={[typography.caption, { color: colors.text, fontWeight: "600", fontSize: 11 }]}>
            Issue Fix to Draft PR
          </Text>
        </Pressable>
      </View>

      {/* Target PR / Repo Picker Modal */}
      <Modal
        visible={targetPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setTargetPickerOpen(false)}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close target selector"
          onPress={() => setTargetPickerOpen(false)}
          style={{
            flex: 1,
            backgroundColor: "rgba(11, 15, 23, 0.72)",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation?.()}
            style={{
              width: "100%",
              maxWidth: 480,
              maxHeight: "75%",
              backgroundColor: colors.surface,
              borderRadius: radius.lg,
              borderWidth: 1,
              borderColor: colors.brandMuted,
              padding: 16,
              gap: 10,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text accessibilityRole="header" style={[typography.headline, { color: colors.text }]}>
                Select a Pull Request or Repository
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={() => setTargetPickerOpen(false)}
                style={{ minWidth: 32, minHeight: 32, alignItems: "center", justifyContent: "center" }}
              >
                <Icon name="close" size={18} color={colors.textSecondary} />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 340 }} contentContainerStyle={{ gap: 6 }}>
              {targetOptions.length === 0 ? (
                <Text style={[typography.footnote, { color: colors.textSecondary, paddingVertical: 12 }]}>
                  No active pull requests or watched repositories loaded yet.
                </Text>
              ) : (
                targetOptions.map((option) => {
                  const selected = activeTarget?.url === option.url;
                  return (
                    <Pressable
                      key={option.key}
                      accessibilityRole="button"
                      accessibilityLabel={`Select ${option.label}`}
                      onPress={() => {
                        setSelectedTargetUrl(option.url);
                        setTargetPickerOpen(false);
                      }}
                      style={({ pressed }) => ({
                        padding: 10,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: selected ? colors.brandLight : colors.border,
                        backgroundColor: selected ? colors.brandSubtle : colors.surfaceElevated,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 10,
                        opacity: pressed ? 0.85 : 1,
                      })}
                    >
                      <Icon
                        name={option.kind === "repo" ? "folder-outline" : "git-pull-request-outline"}
                        size={16}
                        color={selected ? colors.brandLight : colors.textSecondary}
                      />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[typography.caption, { color: colors.text, fontWeight: "700" }]} numberOfLines={1}>
                          {option.label}
                        </Text>
                        <Text style={[typography.caption, { color: colors.textSecondary }]} numberOfLines={1}>
                          {option.sublabel}
                        </Text>
                      </View>
                      {selected && <Icon name="checkmark-circle" size={16} color={colors.statusGood} />}
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Action Template Picker Modal */}
      <Modal
        visible={actionPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setActionPickerOpen(false)}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close action selector"
          onPress={() => setActionPickerOpen(false)}
          style={{
            flex: 1,
            backgroundColor: "rgba(11, 15, 23, 0.72)",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation?.()}
            style={{
              width: "100%",
              maxWidth: 460,
              backgroundColor: colors.surface,
              borderRadius: radius.lg,
              borderWidth: 1,
              borderColor: colors.brandMuted,
              padding: 16,
              gap: 10,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text accessibilityRole="header" style={[typography.headline, { color: colors.text }]}>
                Choose Automation Action
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={() => setActionPickerOpen(false)}
                style={{ minWidth: 32, minHeight: 32, alignItems: "center", justifyContent: "center" }}
              >
                <Icon name="close" size={18} color={colors.textSecondary} />
              </Pressable>
            </View>
            <View style={{ gap: 6 }}>
              {AGENT_TEMPLATES.map((tpl) => {
                const selected = activeTemplate.id === tpl.id;
                return (
                  <Pressable
                    key={tpl.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Select ${tpl.name}`}
                    onPress={() => {
                      setSelectedTemplateId(tpl.id);
                      setActionPickerOpen(false);
                    }}
                    style={({ pressed }) => ({
                      padding: 10,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: selected ? colors.brandLight : colors.border,
                      backgroundColor: selected ? colors.brandSubtle : colors.surfaceElevated,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                      opacity: pressed ? 0.85 : 1,
                    })}
                  >
                    <Icon name={tpl.icon as IconName} size={17} color={colors.brandLight} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[typography.caption, { color: colors.text, fontWeight: "700" }]}>
                        {tpl.name}
                      </Text>
                      <Text style={[typography.caption, { color: colors.textSecondary }]} numberOfLines={2}>
                        {tpl.description}
                      </Text>
                    </View>
                    {selected && <Icon name="checkmark-circle" size={16} color={colors.statusGood} />}
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );

  const actionGrid = isDesktop ? (
    <View style={{ flex: 5, gap: 8 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, flex: 1 }}>
        {actions.map((action) => (
          <Pressable
            key={action.label}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            onPress={action.run}
            style={({ pressed }) => ({
              flexBasis: "47%",
              flexGrow: 1,
              minHeight: 68,
              padding: 11,
              borderRadius: 14,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              flexDirection: "row",
              alignItems: "center",
              gap: 9,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                backgroundColor: colors.surfaceElevated,
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name={action.icon} size={17} color={colors.brandLight} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <Text numberOfLines={1} style={[typography.caption, { color: colors.text, fontWeight: "700", fontSize: 12 }]}>
                  {action.label}
                </Text>
                {typeof action.badge === "number" && action.badge > 0 && (
                  <View
                    style={{
                      paddingHorizontal: 5,
                      paddingVertical: 1,
                      borderRadius: 999,
                      backgroundColor: colors.statusAlertBg,
                      borderWidth: 1,
                      borderColor: colors.statusAlert,
                    }}
                  >
                    <Text style={[typography.caption, { color: colors.statusAlert, fontSize: 9, fontWeight: "700" }]}>
                      {action.badge}
                    </Text>
                  </View>
                )}
              </View>
              <Text numberOfLines={1} style={[typography.caption, { color: colors.textSecondary, fontSize: 11 }]}>
                {action.detail}
              </Text>
            </View>
            <InfoTip title={action.label} body={action.help} size={14} />
          </Pressable>
        ))}
      </View>
    </View>
  ) : (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {actions.map((action) => (
        <Pressable
          key={action.label}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onPress={action.run}
          style={({ pressed }) => ({
            flexBasis: "48%",
            flexGrow: 1,
            minWidth: 0,
            minHeight: 56,
            paddingHorizontal: 10,
            paddingVertical: 8,
            borderRadius: 12,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <View
            style={{
              width: 30,
              height: 30,
              borderRadius: 9,
              backgroundColor: colors.surfaceElevated,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name={action.icon} size={15} color={colors.brandLight} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <Text numberOfLines={1} style={[typography.caption, { color: colors.text, fontWeight: "700", fontSize: 12, flexShrink: 1 }]}>
                {action.label}
              </Text>
              {typeof action.badge === "number" && action.badge > 0 && (
                <View style={{ paddingHorizontal: 5, paddingVertical: 1, borderRadius: 999, backgroundColor: colors.statusAlertBg, borderWidth: 1, borderColor: colors.statusAlert }}>
                  <Text style={[typography.caption, { color: colors.statusAlert, fontSize: 9, fontWeight: "700" }]}>{action.badge}</Text>
                </View>
              )}
            </View>
            <Text numberOfLines={1} style={[typography.caption, { color: colors.textSecondary, fontSize: 10 }]}>
              {action.detail}
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  );

  return (
    <View style={{ gap: 10, marginBottom: 10 }}>
      {isDesktop ? (
        <View style={{ flexDirection: "row", gap: 12, alignItems: "stretch" }}>
          {heroCard}
          {actionGrid}
        </View>
      ) : (
        <>
          {heroCard}
          {actionGrid}
        </>
      )}
    </View>
  );
}
