import React, { useState } from "react";
import { View, Text, ScrollView, TextInput, StyleSheet, Image, Platform, TouchableOpacity } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useTheme } from "../src/context/ThemeContext";
import { api } from "../src/api";
import { toUserMessage } from "../src/api/errors";
import { HighlightResult } from "../src/types";
import { Header } from "../src/components/Header";
import { Button } from "../src/components/Button";
import { Card } from "../src/components/Card";
import { EmptyState } from "../src/components/EmptyState";
import { ErrorState } from "../src/components/ErrorState";
import { LoadingState } from "../src/components/LoadingState";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export default function HighlightScreen() {
  const { colors, typography, spacing, radius } = useTheme();

  const [note, setNote] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<HighlightResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [image, setImage] = useState<ImagePicker.ImagePickerAsset | null>(null);

  const accept = (picked: ImagePicker.ImagePickerResult) => {
    if (picked.canceled || !picked.assets[0]) return;
    const asset = picked.assets[0];
    const type = (asset.mimeType ?? "").toLowerCase();
    if (type && !ALLOWED_TYPES.includes(type)) {
      setError("Use a JPEG, PNG or WebP image.");
      return;
    }
    if (asset.fileSize && asset.fileSize > MAX_IMAGE_BYTES) {
      setError("That image is too large. Pick one under 5 MB.");
      return;
    }
    setError(null);
    setResult(null);
    setImage(asset);
  };

  const pickFromLibrary = async () => {
    accept(await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8, exif: false }));
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError("Camera access is off. Choose a screenshot from your library instead.");
      return;
    }
    accept(await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8, exif: false }));
  };

  const handleAnalyze = async () => {
    if (!image) {
      setError("Choose a screenshot first.");
      return;
    }
    setIsAnalyzing(true);
    setError(null);
    try {
      const res = await api.analyzeHighlight(image.uri, note, image.mimeType ?? undefined);
      setResult(res);
    } catch (e) {
      setError(toUserMessage(e, "Failed to analyze screenshot."));
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
          <Text style={[typography.headline, { color: colors.text }]} accessibilityRole="header">
            Meta AI Vision Analysis
          </Text>
          <Text style={[typography.body, { color: colors.textSecondary, marginTop: 4 }]}>
            Capture or upload a PR screenshot or UI diff. MergeMate locates key UI regions and highlights bugs, spacing mismatches, or contrast regressions.
          </Text>

          <TouchableOpacity
            onPress={pickFromLibrary}
            accessibilityRole="button"
            accessibilityLabel={image ? "Choose a different screenshot" : "Choose a screenshot"}
            style={[styles.uploadBox, { backgroundColor: colors.surfaceElevated, borderColor: colors.border, borderRadius: radius.md, marginTop: spacing.md }]}
          >
            {image ? (
              <>
                <Image source={{ uri: image.uri }} style={styles.preview} resizeMode="contain" accessibilityLabel="Selected screenshot" />
                <Text style={[typography.caption, { color: colors.textMuted, marginTop: 8 }]}>
                  {image.width} × {image.height} px · Tap to choose another
                </Text>
              </>
            ) : (
              <>
                <Text style={{ fontSize: 32 }}>🖼</Text>
                <Text style={[typography.headline, { color: colors.brandLight, marginTop: 8 }]}>Choose a screenshot</Text>
                <Text style={[typography.caption, { color: colors.textMuted }]}>JPEG, PNG or WebP · up to 5 MB</Text>
              </>
            )}
          </TouchableOpacity>
          {Platform.OS !== "web" && (
            <Button title="Take a photo" onPress={takePhoto} variant="secondary" style={{ marginTop: spacing.sm }} />
          )}

          <Text style={[typography.subhead, { color: colors.textSecondary, marginTop: spacing.md }]}>
            Optional Reviewer Note
          </Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="e.g. Check button padding on mobile"
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="Optional reviewer note"
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
          <LoadingState
            title="Analyzing screenshot..."
            message="Checking layout, spacing, and contrast regions with Meta AI."
          />
        ) : error ? (
          <ErrorState
            title="Couldn't analyze screenshot"
            message={error}
            onRetry={image ? handleAnalyze : pickFromLibrary}
            retryLabel={image ? "Try Again" : "Choose Screenshot"}
          />
        ) : result ? (
          <View style={{ marginTop: spacing.base }}>
            <Card>
              <Text style={[typography.headline, { color: colors.brandLight }]} accessibilityRole="header">
                ✦ AI Visual Insight
              </Text>
              <Text style={[typography.body, { color: colors.text, marginTop: 6, lineHeight: 22 }]}>
                {result.insight}
              </Text>

              {result.regions.length > 0 && (
                <Text style={[typography.subhead, { color: colors.textMuted, marginTop: spacing.md, textTransform: "uppercase" }]}>
                  Detected Regions ({result.regions.length})
                </Text>
              )}

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
                      {Math.round(reg.x / 10)}% from left · {Math.round(reg.y / 10)}% from top
                    </Text>
                  </View>
                  {reg.comment !== "" && (
                    <Text style={[typography.footnote, { color: colors.textSecondary, marginTop: 4 }]}>
                      {reg.comment}
                    </Text>
                  )}
                </View>
              ))}

              <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.md }]}>
                🔒 Privacy safe: Screenshot image was evaluated server-side and deleted immediately after processing.
              </Text>
            </Card>
          </View>
        ) : (
          <EmptyState
            icon="🔍"
            title="No screenshot analyzed yet"
            message="Choose a screenshot above and tap Analyze Screenshot with AI to inspect layout and contrast regions."
            actionTitle="Choose Screenshot"
            onAction={pickFromLibrary}
          />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  uploadBox: {
    minHeight: 88,
    padding: 24,
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
  },
  preview: {
    width: "100%",
    height: 200,
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
