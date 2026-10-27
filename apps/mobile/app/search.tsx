import React, { useState, useEffect } from "react";
import { View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "../src/context/ThemeContext";
import { StorageService } from "../src/storage";
import { api } from "../src/api";
import { Notification, RiskLevel } from "../src/types";
import { Header } from "../src/components/Header";
import { StatusPill } from "../src/components/StatusPill";
import { RiskBadge } from "../src/components/RiskBadge";
import { EmptyState } from "../src/components/EmptyState";

export default function SearchScreen() {
  const router = useRouter();
  const { colors, typography, spacing, radius } = useTheme();

  const [query, setQuery] = useState("");
  const [selectedRisk, setSelectedRisk] = useState<RiskLevel | "all">("all");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [allPrs, setAllPrs] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    StorageService.getRecentSearches().then(setRecentSearches);
    api.getNotifications("all").then(setAllPrs).catch(() => {});
  }, []);

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
        {/* Search Input Bar */}
        <View style={[styles.searchBar, { backgroundColor: colors.surfaceElevated, borderColor: colors.border, borderRadius: radius.md }]}>
          <Text style={{ fontSize: 16 }}>🔍</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={handleSearchSubmit}
            placeholder="Search title, repo, author, or diff..."
            placeholderTextColor={colors.textMuted}
            style={[styles.input, { color: colors.text }]}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery("")}>
              <Text style={{ color: colors.textMuted, fontSize: 16 }}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Filter Chips */}
        <View style={styles.filterRow}>
          <Text style={[typography.caption, { color: colors.textSecondary }]}>Risk:</Text>
          {(["all", "high", "medium", "low"] as const).map((r) => {
            const active = selectedRisk === r;
            return (
              <TouchableOpacity
                key={r}
                onPress={() => setSelectedRisk(r)}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: active ? colors.brand : colors.surfaceElevated,
                    borderColor: active ? colors.brand : colors.border,
                    borderRadius: radius.full,
                  },
                ]}
              >
                <Text style={[typography.caption, { color: active ? "#FFFFFF" : colors.textSecondary, textTransform: "capitalize" }]}>
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
                  style={[styles.recentPill, { backgroundColor: colors.surfaceElevated, borderRadius: radius.sm }]}
                >
                  <Text style={[typography.footnote, { color: colors.brandLight }]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.base, paddingBottom: 60 }}>
        {filteredPrs.length === 0 ? (
          <EmptyState
            icon="🔎"
            title="No Results Found"
            message={`No pull requests match "${query}". Try adjusting your query or risk filter.`}
          />
        ) : (
          filteredPrs.map((item) => (
            <TouchableOpacity
              key={item.id}
              onPress={() => {
                const parts = item.repo.split("/");
                const owner = parts[0] || "owner";
                const repo = parts[1] || "repo";
                router.push(`/pr/${owner}/${repo}/7`);
              }}
              style={[
                styles.resultCard,
                { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md },
              ]}
            >
              <View style={styles.cardHeader}>
                <Text style={[typography.caption, { color: colors.textMuted, fontFamily: "monospace" }]}>
                  {item.repo}
                </Text>
                {item.risk && <RiskBadge level={item.risk} compact />}
              </View>
              <Text style={[typography.headline, { color: colors.text, marginTop: 4 }]}>
                {item.title}
              </Text>
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
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    gap: 8,
  },
  input: {
    flex: 1,
    height: "100%",
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
  },
  recentRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
  },
  recentPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  resultCard: {
    padding: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
});
