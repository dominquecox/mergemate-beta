import React, { useState, useEffect, useCallback } from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { useTheme } from "../../src/context/ThemeContext";
import { api } from "../../src/api";
import { toUserMessage } from "../../src/api/errors";
import { PublicPost } from "../../src/types";
import { Header } from "../../src/components/Header";
import { Card } from "../../src/components/Card";
import { EmptyState } from "../../src/components/EmptyState";
import { ErrorState } from "../../src/components/ErrorState";
import { LoadingState } from "../../src/components/LoadingState";

export default function NewsScreen() {
  const { colors, typography, spacing } = useTheme();

  const [posts, setPosts] = useState<PublicPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPosts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getPublicPosts("news");
      setPosts(data);
    } catch (e) {
      setError(toUserMessage(e, "Failed to load news posts."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Header title="Product News" showBack />
      {isLoading ? (
        <LoadingState
          title="Loading product news..."
          message="Fetching recent announcements from the MergeMate team."
        />
      ) : error ? (
        <ErrorState
          title="Couldn't load news"
          message={error}
          onRetry={loadPosts}
        />
      ) : posts.length === 0 ? (
        <EmptyState
          icon="📰"
          title="No news articles yet"
          message="Check back soon for product announcements and feature guides."
          actionTitle="Refresh"
          onAction={loadPosts}
        />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.base, paddingBottom: 60 }}>
          {posts.map((post) => (
            <Card key={post.slug} style={{ marginBottom: spacing.md }}>
              <Text style={[typography.caption, { color: colors.brandLight, fontWeight: "600" }]}>
                {post.date}
              </Text>
              <Text
                style={[typography.title2, { color: colors.text, marginTop: 4 }]}
                accessibilityRole="header"
              >
                {post.title}
              </Text>
              <Text style={[typography.body, { color: colors.textSecondary, marginTop: 6, lineHeight: 22 }]}>
                {post.content}
              </Text>
            </Card>
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
});
