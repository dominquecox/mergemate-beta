import React, { useState } from "react";
import { View, Image, Pressable, StyleSheet } from "react-native";
import { Text } from "./Text";
import { Link, useRouter, useSegments } from "expo-router";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { useAlerts } from "../context/AlertsContext";
import { navItemsFor, isTabActive, type NavItem } from "../navigation/items";
import { useFeatureFlags } from "../hooks/useFeatureFlags";
import { SIDEBAR_WIDTH } from "../layout/breakpoints";
import { Icon, IconName } from "./Icon";

interface SidebarRowProps {
  label: string;
  icon: IconName;
  iconActive: IconName;
  active: boolean;
  href: NavItem["href"] | "/workflows";
  accessibilityLabel: string;
  badgeCount?: number;
}

function SidebarRow({ label, icon, iconActive, active, href, accessibilityLabel, badgeCount }: SidebarRowProps) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const { colors, typography, radius } = useTheme();

  return (
    <Link href={href} asChild>
      <Pressable
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        accessibilityRole="link"
        accessibilityLabel={badgeCount && badgeCount > 0 ? `${accessibilityLabel} (${badgeCount} unread)` : accessibilityLabel}
        accessibilityState={{ selected: active }}
        style={StyleSheet.flatten([
          styles.row,
          {
            borderRadius: radius.md,
            backgroundColor: active
              ? colors.brandSubtle
              : hovered || pressed
                ? colors.surfaceElevated
                : "transparent",
          },
        ])}
      >
        <Icon name={active ? iconActive : icon} size={19} color={active ? colors.brandLight : colors.textMuted} />
        <Text
          style={[
            typography.body,
            { flex: 1, color: active ? colors.brandLight : colors.textSecondary, fontWeight: active ? "700" : "500" },
          ]}
        >
          {label}
        </Text>
        {typeof badgeCount === "number" && badgeCount > 0 && (
          <View
            accessibilityLabel={`${badgeCount} unread alerts`}
            style={{
              minWidth: 22,
              height: 20,
              paddingHorizontal: 6,
              borderRadius: 999,
              backgroundColor: colors.statusAlertBg,
              borderWidth: 1,
              borderColor: colors.statusAlert,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={[typography.caption, { color: colors.statusAlert, fontWeight: "700", fontSize: 10 }]}>
              {badgeCount > 99 ? "99+" : badgeCount}
            </Text>
          </View>
        )}
      </Pressable>
    </Link>
  );
}

/** Desktop navigation (>= 1024px). Replaces the bottom tab bar. */
export function Sidebar() {
  const router = useRouter();
  const segments = useSegments() as string[];
  const { colors, typography, radius, isDark } = useTheme();
  const { user, isDemo } = useAuth();
  const { unreadCount } = useAlerts();
  const [accountHovered, setAccountHovered] = useState(false);

  const inTabs = segments[0] === "(tabs)";
  const searchActive = segments[0] === "search";
  const navItems = navItemsFor(useFeatureFlags());
  const topNavItems = navItems.filter((item) => item.name !== "settings");
  const settingsItem = navItems.find((item) => item.name === "settings");

  return (
    <View
      style={[styles.sidebar, { backgroundColor: colors.surface, borderRightColor: colors.border }]}
      accessibilityRole="navigation"
      accessibilityLabel="Main navigation"
    >
      <View style={styles.logoWrap}>
        <Image
          source={isDark ? require("../../assets/logo-dark.png") : require("../../assets/logo-light.png")}
          style={styles.logo}
          resizeMode="contain"
          accessibilityRole="image"
          accessibilityLabel="MergeMate"
        />
      </View>

      <Pressable
        onPress={() => router.push("/search")}
        accessibilityRole="button"
        accessibilityLabel="Search pull requests"
        accessibilityState={{ selected: searchActive }}
        style={(state) => {
          const hovered = Boolean((state as { hovered?: boolean }).hovered);
          return [
            styles.searchBtn,
            {
              borderRadius: radius.md,
              borderColor: searchActive ? colors.brandLight : colors.border,
              backgroundColor: hovered || state.pressed ? colors.surfaceSecondary : colors.surfaceElevated,
            },
          ];
        }}
      >
        <Icon name="search" size={16} color={colors.textMuted} />
        <Text style={[typography.callout, { color: colors.textSecondary, flex: 1 }]}>Search</Text>
      </Pressable>

      <View style={styles.nav}>
        {topNavItems.map((item) => (
          <SidebarRow
            key={item.name}
            label={item.label}
            icon={item.icon}
            iconActive={item.iconActive}
            active={isTabActive(segments, item.name)}
            accessibilityLabel={item.label}
            href={item.href}
            badgeCount={item.name === "notifications" ? unreadCount : undefined}
          />
        ))}
        <SidebarRow
          label="Workflows"
          icon="git-network-outline"
          iconActive="git-network"
          active={segments[0] === "workflows"}
          accessibilityLabel="Workflows"
          href="/workflows"
        />
      </View>

      <View style={{ flex: 1 }} />

      <View style={{ gap: 6, marginTop: 16 }}>
        {settingsItem && (
          <SidebarRow
            label={settingsItem.label}
            icon={settingsItem.icon}
            iconActive={settingsItem.iconActive}
            active={isTabActive(segments, settingsItem.name)}
            accessibilityLabel={settingsItem.label}
            href={settingsItem.href}
          />
        )}

        <Link href="/(tabs)/settings" asChild>
          <Pressable
            onHoverIn={() => setAccountHovered(true)}
            onHoverOut={() => setAccountHovered(false)}
            accessibilityRole="link"
            accessibilityLabel="Open personal workspace dashboard"
            style={StyleSheet.flatten([
              styles.account,
              {
                borderColor: accountHovered || (inTabs && segments[1] === "settings") ? colors.brandMuted : colors.border,
                backgroundColor: accountHovered ? colors.surfaceElevated : colors.background,
                borderRadius: radius.md,
              },
            ])}
          >
            <View style={[styles.avatar, { backgroundColor: colors.brandSubtle, borderWidth: 1, borderColor: colors.brandMuted }]}>
              <Icon name="person-outline" size={18} color={colors.brandLight} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={[typography.subhead, { color: colors.text, fontWeight: "700" }]} numberOfLines={1}>
                  {user?.name || user?.login || "Your account"}
                </Text>
                <View
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 3.5,
                    backgroundColor: isDemo ? colors.statusWarning : colors.statusGood,
                  }}
                />
              </View>
              <Text style={[typography.caption, { color: colors.textSecondary }]} numberOfLines={1}>
                {isDemo ? "Demo workspace" : "Personal workspace"}
              </Text>
            </View>
            <Icon name="chevron-forward" size={15} color={colors.textMuted} />
          </Pressable>
        </Link>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: SIDEBAR_WIDTH,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    borderRightWidth: 1,
  },
  logoWrap: {
    minHeight: 56,
    justifyContent: "center",
    paddingLeft: 4,
  },
  logo: {
    width: 142,
    height: 34,
  },
  searchBtn: {
    marginTop: 12,
    minHeight: 44,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
  },
  account: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  nav: {
    marginTop: 14,
    gap: 4,
  },
  row: {
    minHeight: 44,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
});
