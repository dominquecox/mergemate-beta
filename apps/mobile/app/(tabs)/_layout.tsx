import React from "react";
import { Platform } from "react-native";
import { Tabs, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../src/context/ThemeContext";
import { useAlerts } from "../../src/context/AlertsContext";
import { useFeatureFlags } from "../../src/hooks/useFeatureFlags";
import { useLayout } from "../../src/layout/useLayout";
import { BRAIN_NAV_ITEM, NAV_ITEMS, type NavItem } from "../../src/navigation/items";
import { Icon } from "../../src/components/Icon";

/** Inbox always exists, so a first mount or a fallback never lands on the Workflows placeholder tab. */
export const unstable_settings = { initialRouteName: "inbox" };

export default function TabsLayout() {
  const { colors, typography } = useTheme();
  const { unreadCount } = useAlerts();
  const flags = useFeatureFlags();
  // On desktop the sidebar is the navigation, so the bottom tab bar goes away.
  const { isDesktop } = useLayout();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // On iPhone the home indicator overlaps the bar; the web build reads it from env(safe-area-inset-bottom).
  const bottomInset = insets.bottom;

  // The screen list keeps one fixed order whatever the flags say. Flags reset while they reload on focus; if the
  // Board screen moved in or out of first place, the navigator would reset to its first tab (the Workflows
  // redirect) and every menu link into the tabs would land on /workflows.
  const item = (name: NavItem["name"]) => (name === "brain" ? BRAIN_NAV_ITEM : NAV_ITEMS.find((value) => value.name === name)!);
  // Narrow web shows only Board, Workflows and Triage; Inbox, Alerts and Settings move to the top bar and side menu.
  const compact = Platform.OS === "web" && !isDesktop;

  const itemScreen = (item: NavItem) => (
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
    />
  );

  // Workflows lives at /workflows (shared with desktop and deep links); this tab opens it.
  const workflowsScreen = (
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
    />
  );

  // Hide only the tab button. `href: null` marks the screen hidden, which expo-router 58 treats like a guarded route:
  // navigating to it redirects to the first visible tab, so Board opened Workflows and Settings did nothing.
  const hidden = (name: NavItem["name"]) => (
    <Tabs.Screen key={name} name={name} options={{ tabBarButton: () => null, tabBarItemStyle: { display: "none" } }} />
  );
  const brainScreen = flags.brain ? itemScreen(BRAIN_NAV_ITEM) : hidden("brain");
  // Narrow web: Board, Workflows and Triage in the bar; Inbox, Alerts and Settings stay routable, hidden from it.
  const compactScreens = [brainScreen, workflowsScreen, itemScreen(item("triage")), hidden("inbox"), hidden("notifications"), hidden("settings")];
  // Wide and native: the full list, Board just before Settings.
  const fullScreens = [itemScreen(item("inbox")), itemScreen(item("triage")), workflowsScreen, itemScreen(item("notifications")), brainScreen, itemScreen(item("settings"))];

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
      {compact ? compactScreens : fullScreens}
    </Tabs>
  );
}
