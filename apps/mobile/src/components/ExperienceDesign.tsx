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
  return <View style={{ gap: compact ? 4 : 6 }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <Icon name="sparkles-outline" size={12} color={colors.brandLight} />
      <Text style={[typography.code, { color: colors.brandLight, fontSize: 10, letterSpacing: 1.2 }]}>{eyebrow.toUpperCase()}</Text>
    </View>
    <Text ref={headingRef} accessibilityRole="header" style={[typography.largeTitle, { color: colors.text, fontSize: compact ? 20 : 24, lineHeight: compact ? 26 : 30, letterSpacing: compact ? -0.3 : -0.5 }]}>{title}</Text>
    <Text style={[typography.footnote, { color: colors.textSecondary, lineHeight: 18, maxWidth: 520 }]}>{description}</Text>
  </View>;
}

export function ExperienceSurface({ children, accent = false, style }: { children: React.ReactNode; accent?: boolean; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return <View style={[{ backgroundColor: accent ? colors.brandSubtle : colors.surface, borderColor: accent ? colors.brandMuted : colors.border, borderWidth: 1, borderRadius: 16, padding: 14 }, style]}>{children}</View>;
}

export function ExperienceFeature({ icon, title, detail }: { icon: IconName; title: string; detail: string }) {
  const { colors, typography } = useTheme();
  return <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 8 }}>
    <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.brandSubtle, alignItems: "center", justifyContent: "center" }}><Icon name={icon} size={18} color={colors.brandLight} /></View>
    <View style={{ flex: 1, gap: 2 }}><Text style={[typography.subhead, { color: colors.text, fontWeight: "600" }]}>{title}</Text><Text style={[typography.footnote, { color: colors.textSecondary, lineHeight: 17 }]}>{detail}</Text></View>
  </View>;
}

export function SetupPath({ active }: { active: "connect" | "repositories" | "ai" }) {
  const { colors, typography } = useTheme();
  const items = [{ id: "connect", title: "Connect", icon: "logo-github" }, { id: "repositories", title: "Choose repos", icon: "folder-open-outline" }, { id: "ai", title: "AI preferences", icon: "sparkles-outline" }] as const;
  return <View accessibilityLabel={`Workspace setup: ${items.find(item => item.id === active)?.title}`} style={{ flexDirection: "row", gap: 8, alignItems: "stretch" }}>
    {items.map(item => <React.Fragment key={item.id}>
      <View style={{ flexGrow: 1, flexBasis: 0, minWidth: 0, paddingVertical: 8, paddingHorizontal: 6, borderRadius: 10, alignItems: "center", gap: 4, borderWidth: 1, borderColor: item.id === active ? colors.brandMuted : colors.border, backgroundColor: item.id === active ? colors.brandSubtle : colors.surface }}>
        <Icon name={item.icon} size={15} color={item.id === active ? colors.brandLight : colors.textSecondary} />
        <Text numberOfLines={1} style={[typography.caption, { color: item.id === active ? colors.brandLight : colors.textSecondary, textAlign: "center", fontSize: 10 }]}>{item.title}</Text>
      </View>
    </React.Fragment>)}
  </View>;
}
