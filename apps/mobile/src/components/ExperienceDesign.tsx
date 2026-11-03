import React from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { Text } from "./Text";
import { Icon, type IconName } from "./Icon";
import { useTheme } from "../context/ThemeContext";

/** The same hierarchy and surfaces connect setup, agent workflows and the review workspace. */
export function ExperienceIntro({ eyebrow, title, description, compact = false, headingRef }: {
  eyebrow: string; title: string; description: string; compact?: boolean;
  headingRef?: React.ComponentPropsWithRef<typeof Text>["ref"];
}) {
  const { colors, typography } = useTheme();
  return <View style={{ gap: compact ? 8 : 12 }}>
    <Text style={[typography.code, { color: colors.brandLight, fontSize: 10, letterSpacing: 1.4 }]}>{eyebrow.toUpperCase()}</Text>
    <Text ref={headingRef} accessibilityRole="header" style={[typography.largeTitle, { color: colors.text, fontSize: compact ? 28 : 38, lineHeight: compact ? 34 : 43, letterSpacing: compact ? -0.5 : -1.1 }]}>{title}</Text>
    <Text style={[typography.body, { color: colors.textSecondary, lineHeight: 22, maxWidth: 520 }]}>{description}</Text>
  </View>;
}

export function ExperienceSurface({ children, accent = false, style }: { children: React.ReactNode; accent?: boolean; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return <View style={[{ backgroundColor: accent ? colors.brandSubtle : colors.surface, borderColor: accent ? colors.brandMuted : colors.border, borderWidth: 1, borderRadius: 24, padding: 20 }, style]}>{children}</View>;
}

export function ExperienceFeature({ icon, title, detail }: { icon: IconName; title: string; detail: string }) {
  const { colors, typography } = useTheme();
  return <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 10 }}>
    <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: colors.brandSubtle, alignItems: "center", justifyContent: "center" }}><Icon name={icon} size={20} color={colors.brandLight} /></View>
    <View style={{ flex: 1, gap: 4 }}><Text style={[typography.subhead, { color: colors.text, fontWeight: "600" }]}>{title}</Text><Text style={[typography.footnote, { color: colors.textSecondary, lineHeight: 19 }]}>{detail}</Text></View>
  </View>;
}

export function SetupPath({ active }: { active: "connect" | "repositories" | "ai" }) {
  const { colors, typography } = useTheme();
  const items = [{ id: "connect", title: "Connect", icon: "logo-github" }, { id: "repositories", title: "Choose repos", icon: "folder-open-outline" }, { id: "ai", title: "AI preferences", icon: "sparkles-outline" }] as const;
  return <View accessibilityLabel={`Workspace setup: ${items.find(item => item.id === active)?.title}`} style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
    {items.map((item, index) => <React.Fragment key={item.id}>
      {index > 0 && <View style={{ height: 1, width: 12, backgroundColor: colors.borderLight }} />}
      <View style={{ flex: 1, minWidth: 0, paddingVertical: 12, paddingHorizontal: 6, borderRadius: 14, alignItems: "center", gap: 7, backgroundColor: item.id === active ? colors.brandSubtle : colors.surface }}>
        <Icon name={item.icon} size={18} color={item.id === active ? colors.brandLight : colors.textSecondary} />
        <Text numberOfLines={2} style={[typography.caption, { color: item.id === active ? colors.brandLight : colors.textSecondary, textAlign: "center", fontSize: 10 }]}>{item.title}</Text>
      </View>
    </React.Fragment>)}
  </View>;
}
