import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Linking } from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "../../src/context/ThemeContext";
import { api } from "../../src/api";
import { Repo, OrgInstallation } from "../../src/types";
import { Header } from "../../src/components/Header";
import { Button } from "../../src/components/Button";
import { EmptyState } from "../../src/components/EmptyState";
import { ErrorState } from "../../src/components/ErrorState";

export default function ReposScreen() {
  const router = useRouter();
  const { colors, typography, spacing, radius } = useTheme();

  const [repos, setRepos] = useState<Repo[]>([]);
  const [orgs, setOrgs] = useState<OrgInstallation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [fetchedRepos, fetchedOrgs] = await Promise.all([
        api.getRepos(),
        api.getOrgInstallations(),
      ]);
      setRepos(fetchedRepos);
      setOrgs(fetchedOrgs);
    } catch (e: any) {
      setError(e.message || "Failed to load repositories.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const toggleWatch = async (id: string, current: boolean) => {
    try {
      const updated = await api.toggleWatchRepo(id, !current);
      setRepos((prev) => prev.map((r) => (r.id === id ? updated : r)));
    } catch (e: any) {
      alert("Failed to update watch status");
    }
  };

  const openGitHubAppConfig = () => {
    Linking.openURL("https://github.com/settings/installations");
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Header
        title="Choose Repositories"
        showBack
        rightAction={
          <TouchableOpacity onPress={() => router.replace("/(tabs)/inbox")}>
            <Text style={[typography.headline, { color: colors.brandLight }]}>Done</Text>
          </TouchableOpacity>
        }
      />

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.brandLight} />
          <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.md }]}>
            Loading connected repositories...
          </Text>
        </View>
      ) : error ? (
        <ErrorState message={error} onRetry={loadData} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.base }}>
          {/* GitHub App Configuration Notice */}
          <View style={[styles.infoBanner, { backgroundColor: colors.surfaceElevated, borderColor: colors.border, borderRadius: radius.md }]}>
            <Text style={[typography.callout, { color: colors.text }]}>
              🔐 Repository access is managed securely on GitHub. Select individual repositories or entire organizations.
            </Text>
            <TouchableOpacity onPress={openGitHubAppConfig} style={{ marginTop: spacing.xs }}>
              <Text style={[typography.subhead, { color: colors.brandLight, fontWeight: "600" }]}>
                Configure in GitHub Settings →
              </Text>
            </TouchableOpacity>
          </View>

          {/* Org Approval & SSO States (US-04) */}
          {orgs.length > 0 && (
            <View style={{ marginTop: spacing.base }}>
              <Text style={[typography.subhead, { color: colors.textMuted, textTransform: "uppercase", marginBottom: spacing.xs }]}>
                Organization Status
              </Text>

              {orgs.map((org) => {
                let badgeBg = colors.surfaceSecondary;
                let badgeText = colors.textSecondary;
                let note = "Active and synced";

                if (org.status === "pending_approval") {
                  badgeBg = colors.demoBadgeBg;
                  badgeText = colors.demoBadge;
                  note = "Waiting for organization admin approval.";
                } else if (org.status === "sso_required") {
                  badgeBg = colors.riskMediumBg;
                  badgeText = colors.riskMedium;
                  note = "SAML Single Sign-On authorization required.";
                } else if (org.status === "ip_blocked") {
                  badgeBg = colors.riskHighBg;
                  badgeText = colors.riskHigh;
                  note = "This organization's IP allow list blocks external cloud workers.";
                }

                return (
                  <View
                    key={org.id}
                    style={[
                      styles.orgCard,
                      { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md },
                    ]}
                  >
                    <View style={styles.orgHeader}>
                      <Text style={[typography.headline, { color: colors.text }]}>{org.org}</Text>
                      <View style={[styles.badge, { backgroundColor: badgeBg }]}>
                        <Text style={[typography.caption, { color: badgeText, fontWeight: "700" }]}>
                          {org.status.replace("_", " ").toUpperCase()}
                        </Text>
                      </View>
                    </View>
                    <Text style={[typography.footnote, { color: colors.textSecondary, marginTop: 4 }]}>
                      {note}
                    </Text>

                    {org.status === "sso_required" && org.ssoUrl && (
                      <TouchableOpacity
                        onPress={() => Linking.openURL(org.ssoUrl!)}
                        style={[styles.ssoBtn, { backgroundColor: colors.brand, borderRadius: radius.sm }]}
                      >
                        <Text style={[typography.caption, { color: "#FFFFFF", fontWeight: "700" }]}>
                          Authorize SSO for {org.org}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {/* Connected Repositories */}
          <View style={{ marginTop: spacing.lg }}>
            <Text style={[typography.subhead, { color: colors.textMuted, textTransform: "uppercase", marginBottom: spacing.xs }]}>
              Connected Repositories ({repos.length})
            </Text>

            {repos.length === 0 ? (
              <EmptyState
                icon="📁"
                title="No repositories selected"
                message="You haven't granted MergeMate access to any repositories yet."
                actionTitle="Add Repositories on GitHub"
                onAction={openGitHubAppConfig}
              />
            ) : (
              repos.map((repo) => (
                <View
                  key={repo.id}
                  style={[
                    styles.repoRow,
                    { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[typography.headline, { color: colors.text }]} numberOfLines={1}>
                      {repo.fullName}
                    </Text>
                    <Text style={[typography.caption, { color: repo.watching ? colors.riskLow : colors.textMuted, marginTop: 2 }]}>
                      {repo.watching ? "● Watching for review requests" : "○ Muted"}
                    </Text>
                  </View>

                  <TouchableOpacity
                    onPress={() => toggleWatch(repo.id, repo.watching)}
                    style={[
                      styles.toggleBtn,
                      {
                        backgroundColor: repo.watching ? colors.brandSubtle : colors.surfaceSecondary,
                        borderColor: repo.watching ? colors.brandLight : colors.border,
                        borderRadius: radius.sm,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        typography.caption,
                        { color: repo.watching ? colors.brandLight : colors.textSecondary, fontWeight: "600" },
                      ]}
                    >
                      {repo.watching ? "Watching" : "Watch"}
                    </Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        </ScrollView>
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
  infoBanner: {
    padding: 12,
    borderWidth: 1,
  },
  orgCard: {
    padding: 12,
    borderWidth: 1,
    marginTop: 8,
  },
  orgHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  ssoBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: "flex-start",
    marginTop: 8,
  },
  repoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderWidth: 1,
    marginTop: 8,
  },
  toggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
  },
});
