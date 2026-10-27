import React, { useState } from "react";
import { View, Text, TextInput, ScrollView, StyleSheet } from "react-native";
import { useTheme } from "../../src/context/ThemeContext";
import { api } from "../../src/api";
import { Header } from "../../src/components/Header";
import { Button } from "../../src/components/Button";
import { Card } from "../../src/components/Card";

export default function SupportScreen() {
  const { colors, typography, spacing, radius } = useTheme();

  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    if (!email || !message) {
      alert("Please enter your email and message.");
      return;
    }
    setIsSending(true);
    try {
      await api.sendSupportMessage(email, message);
      setSent(true);
    } catch {
      alert("Failed to send message. Please email support@mergemate.dev directly.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Header title="Support & Contact" showBack />
      <ScrollView contentContainerStyle={{ padding: spacing.base, paddingBottom: 60 }}>
        <Text style={[typography.title1, { color: colors.text }]}>How can we help?</Text>
        <Text style={[typography.body, { color: colors.textSecondary, marginTop: 4 }]}>
          Reach the engineering team directly at{" "}
          <Text style={{ color: colors.brandLight, fontWeight: "600" }}>support@mergemate.dev</Text>.
        </Text>

        <Card style={{ marginTop: spacing.lg }}>
          {sent ? (
            <View style={{ alignItems: "center", paddingVertical: spacing.lg }}>
              <Text style={{ fontSize: 36 }}>✉️</Text>
              <Text style={[typography.title2, { color: colors.text, marginTop: 8 }]}>Message Sent</Text>
              <Text style={[typography.body, { color: colors.textSecondary, marginTop: 4, textAlign: "center" }]}>
                Thank you! We have received your inquiry and will respond to {email} within 24 hours.
              </Text>
            </View>
          ) : (
            <>
              <Text style={[typography.subhead, { color: colors.textSecondary }]}>Your Email Address</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@company.com"
                placeholderTextColor={colors.textMuted}
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
                placeholder="Describe your issue or feature request..."
                placeholderTextColor={colors.textMuted}
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

              <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.sm }]}>
                🛡 Protected by Cloudflare Turnstile rate limiting against automated spam.
              </Text>

              <Button
                title="Send Message"
                onPress={handleSubmit}
                loading={isSending}
                variant="primary"
                style={{ marginTop: spacing.md }}
              />
            </>
          )}
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  input: {
    padding: 12,
    borderWidth: 1,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: "top",
  },
});
