import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Linking } from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "../../src/context/ThemeContext";
import { api } from "../../src/api";
import { toUserMessage, isApiClientError } from "../../src/api/errors";
import { Repo, OrgInstallation } from "../../src/types";
import { Header } from "../../src/components/Header";
import { Button } from "../../src/components/Button";
import { EmptyState } from "../../src/components/EmptyState";
import { ErrorState } from "../../src/components/ErrorState";
import { LoadingState } from "../../src/components/LoadingState";

export default function ReposScreen() {
  const router = useRouter();
  const { colors, typography, spacing, radius } = useTheme();

  const [repos, setRepos] = useState<Repo[]>([]);
  const [orgs, setOrgs] = useState<OrgInstallation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ssoUrl, setSsoUrl] = useState<string | null>(null);
  const [installUrl, setInstallUrl] = useState("https://github.com/settings/installations");

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    setSsoUrl(null);
    try {
      const [fetchedRepos, installations] = await Promise.all([
        api.getRepos(),
        api.getOrgInstallations(),
      ]);
      setRepos(fetchedRepos);
      setOrgs(installations.items);
      setInstallUrl(installations.installUrl);
    } catch (e) {
      setError(toUserMessage(e, "We couldn't load your connected repositories. Please try again."));
      if (isApiClientError(e, "sso_required") && e.ssoUrl) setSsoUrl(e.ssoUrl);
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
    } catch (e) {
      setError(toUserMessage(e, "We couldn't update the watch setting for that repository. Please try again."));
    }
  };

  const openGitHubAppConfig = () => {
    Linking.openURL(installUrl);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Header
        title="Choose Repositories"
        showBack
        rightAction={
          <TouchableOpacity
            onPress={() => router.replace("/(tabs)/inbox")}
            style={styles.doneBtn}
            accessibilityRole="button"
            accessibilityLabel="Done choosing repositories"
          >
            <Text style={[typography.headline, { color: colors.brandLight, fontWeight: "600" }]}>Done</Text>
          </TouchableOpacity>
        }
      />

      {isLoading ? (
        <LoadingState
          title="Loading your repositories..."
          message="Checking which repositories and organizations are connected to MergeMate."
        />
      ) : error ? (
        <View>
          <ErrorState
            title="Could not load repositories"
            message={error}
            onRetry={loadData}
          />
          {ssoUrl && (
            <View style={{ alignItems: "center", paddingHorizontal: spacing.base }}>
              <Button title="Authorize single sign-on on GitHub" onPress={() => Linking.openURL(ssoUrl)} variant="primary" />
            </View>
          )}
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.base }}>
          {/* GitHub App Configuration Notice */}
          <View style={[styles.infoBanner, { backgroundColor: colors.surfaceElevated, borderColor: colors.border, borderRadius: radius.md }]}>
            <Text style={[typography.callout, { color: colors.text }]}>
              🔐 Repository access is managed on GitHub. Choose individual repositories or whole organizations.
            </Text>
            <TouchableOpacity
              onPress={openGitHubAppConfig}
              style={styles.configLinkBtn}
              accessibilityRole="link"
              accessibilityLabel="Configure repository access in GitHub Settings"
            >
              <Text style={[typography.subhead, { color: colors.brandLight, fontWeight: "600" }]}>
                Configure in GitHub Settings →
              </Text>
            </TouchableOpacity>
          </View>

          {/* Org Approval & SSO States (US-04) */}
          {orgs.length > 0 && (
            <View style={{ marginTop: spacing.base }}>
              <Text
                style={[typography.subhead, { color: colors.textMuted, textTransform: "uppercase", marginBottom: spacing.xs }]}
                accessibilityRole="header"
              >
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
                } else if (org.status === "suspended") {
                  badgeBg = colors.riskHighBg;
                  badgeText = colors.riskHigh;
                  note = "MergeMate is suspended for this account on GitHub.";
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

                    {org.manageUrl && (
                      <TouchableOpacity
                        onPress={() => Linking.openURL(org.manageUrl!)}
                        style={styles.configLinkBtn}
                        accessibilityRole="link"
                        accessibilityLabel={`Manage ${org.org} repositories on GitHub`}
                      >
                        <Text style={[typography.caption, { color: colors.brandLight, fontWeight: "600" }]}>
                          Manage repositories on GitHub →
                        </Text>
                      </TouchableOpacity>
                    )}

                    {org.status === "sso_required" && org.ssoUrl && (
                      <TouchableOpacity
                        onPress={() => Linking.openURL(org.ssoUrl!)}
                        style={[styles.ssoBtn, { backgroundColor: colors.brand, borderRadius: radius.sm }]}
                        accessibilityRole="link"
                        accessibilityLabel={`Authorize SSO for ${org.org}`}
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
            <Text
              style={[typography.subhead, { color: colors.textMuted, textTransform: "uppercase", marginBottom: spacing.xs }]}
              accessibilityRole="header"
            >
              Connected Repositories ({repos.length})
            </Text>

            {repos.length === 0 ? (
              <EmptyState
                icon="📁"
                title="No repositories selected"
                message="You haven't connected any repositories yet. Add one on GitHub to start seeing pull requests."
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
                  <View style={{ flex: 1, paddingRight: spacing.sm }}>
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
                    accessibilityRole="switch"
                    accessibilityState={{ checked: repo.watching }}
                    accessibilityLabel={`${repo.watching ? "Stop watching" : "Watch"} ${repo.fullName}`}
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
  doneBtn: {
    minHeight: 44,
    minWidth: 52,
    paddingHorizontal: 8,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  infoBanner: {
    padding: 12,
    borderWidth: 1,
  },
  configLinkBtn: {
    minHeight: 44,
    justifyContent: "center",
    alignSelf: "flex-start",
    marginTop: 4,
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
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignSelf: "flex-start",
    justifyContent: "center",
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
    minHeight: 44,
    minWidth: 88,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
