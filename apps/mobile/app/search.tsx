import { ScreenIntro } from "../src/components/ScreenDesign";
import React, { useState, useEffect, useCallback } from "react";
import { View, TextInput, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { Text } from "../src/components/Text";
import { useRouter } from "expo-router";
import { useTheme } from "../src/context/ThemeContext";
import { StorageService } from "../src/storage";
import { api } from "../src/api";
import { toUserMessage } from "../src/api/errors";
import { Notification, RiskLevel } from "../src/types";
import { Header } from "../src/components/Header";
import { StatusPill } from "../src/components/StatusPill";
import { RiskBadge } from "../src/components/RiskBadge";
import { EmptyState } from "../src/components/EmptyState";
import { ErrorState } from "../src/components/ErrorState";
import { LoadingState } from "../src/components/LoadingState";
import { Icon } from "../src/components/Icon";

export default function SearchScreen() {
  const router = useRouter();
  const { colors, typography, spacing, radius } = useTheme();

  const [query, setQuery] = useState("");
  const [selectedRisk, setSelectedRisk] = useState<RiskLevel | "all">("all");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [allPrs, setAllPrs] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSearchItems = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [recent, prs] = await Promise.all([
        StorageService.getRecentSearches(),
        api.getNotifications("all"),
      ]);
      setRecentSearches(recent);
      setAllPrs(prs);
    } catch (e) {
      setError(toUserMessage(e, "We couldn't load your pull requests for search. Please try again."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSearchItems();
  }, [loadSearchItems]);

  const handleSearchSubmit = async () => {
    if (query.trim()) {
      await StorageService.addRecentSearch(query.trim());
      setRecentSearches(await StorageService.getRecentSearches());
    }
  };

  const filteredPrs = allPrs.filter((pr) => {
    const matchesQuery =
      query.trim() === "" ||
      pr.title.toLowerCase().includes(query.toLowerCase()) ||
      pr.repo.toLowerCase().includes(query.toLowerCase()) ||
      pr.author.toLowerCase().includes(query.toLowerCase());

    const matchesRisk = selectedRisk === "all" || pr.risk === selectedRisk;

    return matchesQuery && matchesRisk;
  });

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Header title="Search & Filter" showBack />
      <View style={{ padding: spacing.base }}>
        <ScreenIntro eyebrow="Find your next review" title="Search & Filters" description="Search your review inbox by title, repository or author." icon="search-outline"/>
        {/* Search Input Bar */}
        <View style={[styles.searchBar, { backgroundColor: colors.surfaceElevated, borderColor: colors.border, borderRadius: radius.md }]}>
          <Icon name="search-outline" size={18} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={handleSearchSubmit}
            placeholder="Search title, repository, author..."
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="Search pull requests by title, repository, or author"
            style={[styles.input, { color: colors.text }]}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity
              onPress={() => setQuery("")}
              accessibilityRole="button"
              accessibilityLabel="Clear search query"
              style={styles.clearBtn}
            >
              <Icon name="close-circle" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Filter Chips */}
        <View style={styles.filterRow} accessibilityRole="tablist">
          <Text style={[typography.caption, { color: colors.textSecondary }]}>Risk:</Text>
          {(["all", "high", "medium", "low"] as const).map((r) => {
            const active = selectedRisk === r;
            return (
              <TouchableOpacity
                key={r}
                onPress={() => setSelectedRisk(r)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Filter by ${r} risk`}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: active ? colors.brand : colors.surfaceElevated,
                    borderColor: active ? colors.brand : colors.border,
                    borderRadius: radius.full,
                  },
                ]}
              >
                <Text style={[typography.caption, { color: active ? "#FFFFFF" : colors.textSecondary, textTransform: "capitalize", fontWeight: "600" }]}>
                  {r}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Recent Searches */}
        {recentSearches.length > 0 && query.trim() === "" && (
          <View style={{ marginTop: spacing.md }}>
            <Text style={[typography.caption, { color: colors.textMuted, textTransform: "uppercase" }]}>
              Recent Searches
            </Text>
            <View style={styles.recentRow}>
              {recentSearches.map((s, idx) => (
                <TouchableOpacity
                  key={idx}
                  onPress={() => setQuery(s)}
                  accessibilityRole="button"
                  accessibilityLabel={`Search for ${s}`}
                  style={[styles.recentPill, { backgroundColor: colors.surfaceElevated, borderColor: colors.border, borderRadius: radius.sm }]}
                >
                  <Text style={[typography.footnote, { color: colors.brandLight, fontWeight: "600" }]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </View>

      {isLoading ? (
        <LoadingState
          title="Loading pull requests..."
          message="Preparing your searchable pull request list."
        />
      ) : error ? (
        <ErrorState
          title="Couldn't load search results"
          message={error}
          onRetry={loadSearchItems}
        />
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.base, paddingBottom: 60 }}>
          <View style={{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginBottom:16}}><Text style={[typography.headline,{color:colors.text}]}>Results</Text><Text style={[typography.code,{color:colors.textSecondary}]}>{filteredPrs.length} pull requests</Text></View>
          {filteredPrs.length === 0 ? (
            <EmptyState
              icon="search-outline"
              title="No matching pull requests"
              message={
                query.trim()
                  ? `No pull requests match "${query}". Try clearing your search or changing the risk filter.`
                  : "No pull requests match the selected risk filter."
              }
              actionTitle="Clear Filters"
              onAction={() => {
                setQuery("");
                setSelectedRisk("all");
              }}
            />
          ) : (
            filteredPrs.map((item) => (
              <TouchableOpacity
                key={item.id}
                onPress={() => {
                  const parts = item.repo.split("/");
                  const owner = parts[0] || "owner";
                  const repo = parts[1] || "repo";
                  router.push(`/pr/${owner}/${repo}/${item.number}`);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Open pull request ${item.title} in ${item.repo}`}
                style={[
                  styles.resultCard,
                  { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md },
                ]}
              >
                <View style={styles.cardHeader}>
                  <Text style={[typography.caption, { color: colors.textMuted, fontFamily: typography.code.fontFamily }]}>
                    #{item.number} · {item.repo}
                  </Text>
                  {item.risk && <RiskBadge level={item.risk} compact />}
                </View>
                <Text style={[typography.headline, { color: colors.text, marginTop: 4 }]}>
                  {item.title}
                </Text>
                {item.summaryLine && <View style={{padding:12,backgroundColor:colors.surfaceElevated,borderRadius:8,marginTop:12}}><Text style={[typography.footnote,{color:colors.textSecondary}]}>{item.summaryLine}</Text></View>}
                <View style={styles.cardFooter}>
                  <StatusPill status={item.status} />
                  <Text style={[typography.caption, { color: colors.textMuted }]}>
                    By @{item.author}
                  </Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 12,
    paddingRight: 4,
    minHeight: 44,
    borderWidth: 1,
    gap: 8,
  },
  input: {
    fontFamily: "Geist_400Regular",
    flex: 1,
    minHeight: 44,
  },
  clearBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 44,
    minWidth: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  recentRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
  },
  recentPill: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
    minWidth: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  resultCard: {
    padding: 20,
    borderWidth: 1,
    marginBottom: 16,
    minHeight: 44,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
});
