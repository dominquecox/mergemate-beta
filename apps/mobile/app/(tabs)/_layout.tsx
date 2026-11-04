import React from "react";
import { Platform } from "react-native";
import { Tabs, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../src/context/ThemeContext";
import { useAlerts } from "../../src/context/AlertsContext";
import { useLayout } from "../../src/layout/useLayout";
import { NAV_ITEMS } from "../../src/navigation/items";
import { Icon } from "../../src/components/Icon";

export default function TabsLayout() {
  const { colors, typography } = useTheme();
  const { unreadCount } = useAlerts();
  // On desktop the sidebar is the navigation, so the bottom tab bar goes away.
  const { isDesktop } = useLayout();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // On iPhone the home indicator overlaps the bar; the web build reads it from env(safe-area-inset-bottom).
  const bottomInset = insets.bottom;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // The tab scene otherwise paints the navigation library's light default (#F2F2F2) behind loading and empty states.
        sceneStyle: { backgroundColor: colors.background },
        tabBarStyle: isDesktop
          ? { display: "none" }
          : {
              backgroundColor: colors.surface,
              borderTopColor: colors.border,
              borderColor: colors.border,
              borderWidth: 1,
              borderTopWidth: 1,
              borderRadius: 24,
              marginHorizontal: 12,
              marginBottom: Platform.OS === "web" ? 12 : 4,
              paddingHorizontal: 6,
              height: (Platform.OS === "web" ? 76 : 62) + bottomInset,
              paddingBottom: (Platform.OS === "web" ? 12 : 6) + bottomInset,
              paddingTop: 8,
            },
        tabBarActiveTintColor: colors.brandLight,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: {
          ...typography.caption,
          fontWeight: "600",
          // Full line height so descenders ("Triage") are not clipped on web.
          lineHeight: Math.ceil((typography.caption.fontSize ?? 12) * 1.4),
          paddingBottom: 2,
        },
        tabBarItemStyle: { minHeight: 44 },
      }}
    >
      {NAV_ITEMS.flatMap((item) => [
        <Tabs.Screen
          key={item.name}
          name={item.name}
          options={{
            title: item.label,
            tabBarAccessibilityLabel: item.tabLabel,
            tabBarBadge: item.name === "notifications" && unreadCount > 0 ? (unreadCount > 99 ? "99+" : unreadCount) : undefined,
            tabBarBadgeStyle: {
              backgroundColor: colors.statusAlertBg,
              color: colors.statusAlert,
              fontSize: 10,
              fontWeight: "700",
            },
            tabBarIcon: ({ color, focused }) => (
              <Icon name={focused ? item.iconActive : item.icon} size={22} color={color as string} />
            ),
          }}
        />,
        ...(item.name === "triage"
          ? [
              // Workflows lives at /workflows (shared with desktop and deep links); this tab opens it.
              <Tabs.Screen
                key="workflows-tab"
                name="workflows-tab"
                options={{
                  title: "Workflows",
                  tabBarAccessibilityLabel: "Workflows tab",
                  tabBarIcon: ({ color }) => <Icon name="git-network-outline" size={22} color={color as string} />,
                }}
                listeners={{
                  tabPress: (event) => {
                    event.preventDefault();
                    router.push("/workflows");
                  },
                }}
              />,
            ]
          : []),
      ])}
    </Tabs>
  );
}
