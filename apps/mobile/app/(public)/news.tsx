import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
import { useTheme } from "../../src/context/ThemeContext";
import { api } from "../../src/api";
import { PublicPost } from "../../src/types";
import { Header } from "../../src/components/Header";
import { Card } from "../../src/components/Card";
import { EmptyState } from "../../src/components/EmptyState";
import { ErrorState } from "../../src/components/ErrorState";

export default function NewsScreen() {
  const { colors, typography, spacing } = useTheme();

  const [posts, setPosts] = useState<PublicPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getPublicPosts("news")
      .then(setPosts)
      .catch((e) => setError(e.message || "Failed to load news posts."))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Header title="Product News" showBack />
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.brandLight} />
        </View>
      ) : error ? (
        <ErrorState message={error} />
      ) : posts.length === 0 ? (
        <EmptyState title="No News Yet" message="Check back soon for product announcements and feature deep-dives." />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.base, paddingBottom: 60 }}>
          {posts.map((post) => (
            <Card key={post.slug} style={{ marginBottom: spacing.md }}>
              <Text style={[typography.caption, { color: colors.brandLight, fontWeight: "600" }]}>
                {post.date}
              </Text>
              <Text style={[typography.title2, { color: colors.text, marginTop: 4 }]}>
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
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
