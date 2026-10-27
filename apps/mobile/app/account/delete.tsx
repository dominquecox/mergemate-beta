import React, { useState } from "react";
import { View, Text, StyleSheet, Alert, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "../../src/context/ThemeContext";
import { useAuth } from "../../src/context/AuthContext";
import { toUserMessage } from "../../src/api/errors";
import { Header } from "../../src/components/Header";
import { Button } from "../../src/components/Button";
import { Card } from "../../src/components/Card";

export default function DeleteAccountScreen() {
  const router = useRouter();
  const { colors, typography, spacing, radius } = useTheme();
  const { deleteAccount, user } = useAuth();
  const [isDeleting, setIsDeleting] = useState(false);

  const confirmDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteAccount();
      router.replace("/(auth)/sign-in");
    } catch (e) {
      alert(`${toUserMessage(e, "Failed to delete account.")} If it keeps failing, contact support@mergemate.dev`);
      setIsDeleting(false);
    }
  };

  const handleDeletePress = () => {
    if (Platform.OS === "web") {
      if (window.confirm("Permanently delete your MergeMate account? This action cannot be undone.")) {
        confirmDelete();
      }
    } else {
      Alert.alert(
        "Delete Account",
        "Permanently delete your MergeMate account? All stored data, caches, and GitHub authorizations will be immediately revoked.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Permanently Delete", style: "destructive", onPress: confirmDelete },
        ]
      );
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Header title="Delete Account" showBack />
      <View style={[styles.content, { padding: spacing.xl }]}>
        <View style={[styles.iconCircle, { backgroundColor: colors.riskHighBg }]}>
          <Text style={{ fontSize: 32 }}>⚠️</Text>
        </View>

        <Text style={[typography.title1, { color: colors.riskHigh, marginTop: spacing.md, textAlign: "center" }]}>
          Delete Your Account
        </Text>

        <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.sm, textAlign: "center" }]}>
          Account: @{user?.login || "demo-developer"}
        </Text>

        <Card style={{ marginTop: spacing.lg, width: "100%" }}>
          <Text style={[typography.headline, { color: colors.text }]}>What happens when you delete:</Text>
          <Text style={[typography.callout, { color: colors.textSecondary, marginTop: 8, lineHeight: 22 }]}>
            • Any active Stripe subscription is canceled immediately.{"\n"}
            • All sessions, cached summaries, and stored data are purged.{"\n"}
            • MergeMate's GitHub App authorization grant is revoked.{"\n"}
            • This action is permanent and cannot be undone.
          </Text>
        </Card>

        <View style={[styles.actions, { marginTop: spacing.xl }]}>
          <Button
            title="Permanently Delete Account"
            onPress={handleDeletePress}
            loading={isDeleting}
            variant="destructive"
            style={{ width: "100%" }}
          />
          <Button
            title="Cancel"
            onPress={() => router.back()}
            variant="secondary"
            style={{ width: "100%", marginTop: spacing.sm }}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    alignItems: "center",
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
  },
  actions: {
    width: "100%",
  },
});
