import React, { useState } from "react";
import { View, Text, ScrollView, TextInput, StyleSheet, ActivityIndicator } from "react-native";
import { useTheme } from "../src/context/ThemeContext";
import { api } from "../src/api";
import { HighlightResult } from "../src/types";
import { Header } from "../src/components/Header";
import { Button } from "../src/components/Button";
import { Card } from "../src/components/Card";
import { ErrorState } from "../src/components/ErrorState";

export default function HighlightScreen() {
  const { colors, typography, spacing, radius } = useTheme();

  const [note, setNote] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<HighlightResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    setError(null);
    try {
      const res = await api.analyzeHighlight("mock_screenshot_uri", note);
      setResult(res);
    } catch (e: any) {
      setError(e.message || "Failed to analyze screenshot.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Header title="Screenshot Highlight" showBack />
      <ScrollView contentContainerStyle={{ padding: spacing.base, paddingBottom: 60 }}>
        {/* Intro Card */}
        <Card>
          <Text style={[typography.headline, { color: colors.text }]}>Meta AI Vision Analysis</Text>
          <Text style={[typography.body, { color: colors.textSecondary, marginTop: 4 }]}>
            Capture or upload a PR screenshot or UI diff. MergeMate locates key UI regions and highlights bugs, spacing mismatches, or contrast regressions.
          </Text>

          <View style={[styles.uploadBox, { backgroundColor: colors.surfaceElevated, borderColor: colors.border, borderRadius: radius.md, marginTop: spacing.md }]}>
            <Text style={{ fontSize: 32 }}>🖼</Text>
            <Text style={[typography.headline, { color: colors.brandLight, marginTop: 8 }]}>
              Sample PR Screenshot Attached
            </Text>
            <Text style={[typography.caption, { color: colors.textMuted }]}>
              1170 × 2532 px · JPEG · Metadata stripped
            </Text>
          </View>

          <Text style={[typography.subhead, { color: colors.textSecondary, marginTop: spacing.md }]}>
            Optional Reviewer Note
          </Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="e.g. Check button padding on mobile"
            placeholderTextColor={colors.textMuted}
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

          <Button
            title="Analyze Screenshot with AI"
            onPress={handleAnalyze}
            loading={isAnalyzing}
            variant="primary"
            style={{ marginTop: spacing.md }}
          />
        </Card>

        {isAnalyzing ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.brandLight} />
            <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.md }]}>
              Evaluating image with Meta multimodal models...
            </Text>
          </View>
        ) : error ? (
          <ErrorState message={error} onRetry={handleAnalyze} />
        ) : result ? (
          <View style={{ marginTop: spacing.base }}>
            <Card>
              <Text style={[typography.headline, { color: colors.brandLight }]}>✦ AI Visual Insight</Text>
              <Text style={[typography.body, { color: colors.text, marginTop: 6, lineHeight: 22 }]}>
                {result.insight}
              </Text>

              <Text style={[typography.subhead, { color: colors.textMuted, marginTop: spacing.md, textTransform: "uppercase" }]}>
                Detected Regions ({result.regions.length})
              </Text>

              {result.regions.map((reg) => (
                <View
                  key={reg.id}
                  style={[
                    styles.regionCard,
                    { backgroundColor: colors.surfaceElevated, borderColor: colors.border, borderRadius: radius.md },
                  ]}
                >
                  <View style={styles.regionHeader}>
                    <Text style={[typography.headline, { color: colors.text }]}>{reg.label}</Text>
                    <Text style={[typography.caption, { color: colors.brandLight }]}>
                      {reg.width}×{reg.height} at ({reg.x},{reg.y})
                    </Text>
                  </View>
                  <Text style={[typography.footnote, { color: colors.textSecondary, marginTop: 4 }]}>
                    {reg.comment}
                  </Text>
                </View>
              ))}

              <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.md }]}>
                🔒 Privacy safe: Screenshot image was evaluated server-side and deleted immediately after processing.
              </Text>
            </Card>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  uploadBox: {
    padding: 24,
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    padding: 12,
    borderWidth: 1,
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  regionCard: {
    padding: 12,
    borderWidth: 1,
    marginTop: 8,
  },
  regionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
});
