import React, { useState } from "react";
import { ScrollView, TouchableOpacity, View } from "react-native";
import { Text } from "./Text";
import { Icon } from "./Icon";
import { useTheme } from "../context/ThemeContext";
import { DEMO_HIGHLIGHT_SAMPLES } from "../highlight/demoSamples";

export function DemoHighlightGallery() {
  const { colors, typography, radius, spacing } = useTheme();
  const [picked, setPicked] = useState<string | null>(null);
  const sample = DEMO_HIGHLIGHT_SAMPLES.find((s) => s.id === picked) ?? null;
  return (
    <ScrollView testID="highlight-demo-gallery" contentContainerStyle={{ padding: spacing.base, gap: 12 }}>
      <Text style={[typography.footnote, { color: colors.textSecondary }]}>
        Try a sample. These are example results: nothing is uploaded and no account is needed. Sign in with GitHub to analyze your own.
      </Text>
      {DEMO_HIGHLIGHT_SAMPLES.map((s) => (
        <TouchableOpacity key={s.id} accessibilityRole="button" accessibilityLabel={`Show sample result: ${s.title}`} accessibilityState={{ selected: picked === s.id }} onPress={() => setPicked(s.id)} style={{ minHeight: 44, padding: 12, borderRadius: radius.lg, backgroundColor: picked === s.id ? colors.brandSubtle : colors.surface, borderWidth: 1, borderColor: colors.border, gap: 6 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Icon name={s.kind === "Build log" ? "terminal-outline" : "image-outline"} size={16} color={colors.brandLight} />
            <Text style={[typography.subhead, { color: colors.text, fontWeight: "600", flex: 1 }]}>{s.title}</Text>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>{s.kind}</Text>
          </View>
          <Text style={[typography.code, { color: colors.textSecondary, fontSize: 11 }]} numberOfLines={4}>{s.excerpt}</Text>
        </TouchableOpacity>
      ))}
      {sample && (
        <View testID="highlight-demo-result" accessibilityLiveRegion="polite" style={{ padding: 12, borderRadius: radius.lg, backgroundColor: colors.surfaceElevated, gap: 8 }}>
          <Text style={[typography.caption, { color: colors.demoBadge, fontWeight: "700" }]}>SAMPLE RESULT · AI estimates</Text>
          <Text style={[typography.body, { color: colors.text }]}>{sample.insight}</Text>
          <Text style={[typography.subhead, { color: colors.text, fontWeight: "600" }]} accessibilityRole="header">Suggested areas ({sample.areas.length})</Text>
          {sample.areas.map((a) => (
            <Text key={a.label} style={[typography.footnote, { color: colors.textSecondary }]}>{`${a.label}: ${a.comment}`}</Text>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
