import React, { useState } from "react";
import { View, TextInput, ScrollView, StyleSheet } from "react-native";
import { Text } from "../../src/components/Text";
import { useTheme } from "../../src/context/ThemeContext";
import { api } from "../../src/api";
import { toUserMessage } from "../../src/api/errors";
import { Header } from "../../src/components/Header";
import { Button } from "../../src/components/Button";
import { Card } from "../../src/components/Card";
import { EmptyState } from "../../src/components/EmptyState";
import { ErrorState } from "../../src/components/ErrorState";
import { LoadingState } from "../../src/components/LoadingState";
import { Icon } from "../../src/components/Icon";

export default function SupportScreen() {
  const { colors, typography, spacing, radius } = useTheme();

  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!email.trim() || !message.trim()) {
      setError("Please enter both your email address and your message before sending.");
      return;
    }
    setIsSending(true);
    setError(null);
    try {
      await api.sendSupportMessage(email.trim(), message.trim());
      setSent(true);
    } catch (e) {
      setError(`${toUserMessage(e, "Failed to send message.")} You can also email support@mergemate.dev directly.`);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Header title="Support & Contact" showBack />
      {isSending ? (
        <LoadingState
          title="Sending your message..."
          message="Delivering your inquiry to the MergeMate support team."
        />
      ) : error ? (
        <ErrorState
          title="Couldn't send message"
          message={error}
          onRetry={handleSubmit}
        />
      ) : sent ? (
        <EmptyState
          icon="mail-outline"
          title="Message sent"
          message={`Thank you! We received your message and will reply to ${email} within 24 hours.`}
          actionTitle="Send Another Message"
          onAction={() => {
            setSent(false);
            setMessage("");
          }}
        />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.base, paddingBottom: 60 }}>
          <Text style={[typography.title1, { color: colors.text }]} accessibilityRole="header">
            How can we help?
          </Text>
          <Text style={[typography.body, { color: colors.textSecondary, marginTop: 4 }]}>
            Reach the engineering team directly at{" "}
            <Text style={{ color: colors.brandLight, fontWeight: "600" }}>support@mergemate.dev</Text>.
          </Text>

          <Card style={{ marginTop: spacing.lg }}>
            <Text style={[typography.subhead, { color: colors.textSecondary }]}>Your Email Address</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@company.com"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Your email address"
              keyboardType="email-address"
              autoCapitalize="none"
              style={[
                styles.input,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: colors.border,
                  color: colors.text,
                  borderRadius: radius.md,
                  marginTop: 4,
                },
              ]}
            />

            <Text style={[typography.subhead, { color: colors.textSecondary, marginTop: spacing.md }]}>
              Message or Feedback
            </Text>
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder="Describe your question, issue, or feature request..."
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Message or feedback"
              multiline
              numberOfLines={5}
              style={[
                styles.input,
                styles.textArea,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: colors.border,
                  color: colors.text,
                  borderRadius: radius.md,
                  marginTop: 4,
                },
              ]}
            />

            <View style={[styles.noticeRow, { marginTop: spacing.sm }]}>
              <Icon name="shield-checkmark-outline" size={14} color={colors.textMuted} />
              <Text style={[typography.caption, { color: colors.textMuted, flex: 1 }]}>
                Protected by Cloudflare Turnstile rate limiting against automated spam.
              </Text>
            </View>

            <Button
              title="Send Message"
              onPress={handleSubmit}
              loading={isSending}
              variant="primary"
              style={{ marginTop: spacing.md }}
            />
          </Card>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  noticeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  root: {
    flex: 1,
  },
  input: {
    minHeight: 44,
    padding: 12,
    borderWidth: 1,
  },
  textArea: {
    minHeight: 110,
    textAlignVertical: "top",
  },
});
