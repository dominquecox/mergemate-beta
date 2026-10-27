import React from "react";
import { Platform } from "react-native";
import { Tabs } from "expo-router";
import { useTheme } from "../../src/context/ThemeContext";
import { useLayout } from "../../src/layout/useLayout";
import { NAV_ITEMS } from "../../src/navigation/items";
import { Icon } from "../../src/components/Icon";

export default function TabsLayout() {
  const { colors, typography } = useTheme();
  // On desktop the sidebar is the navigation, so the bottom tab bar goes away.
  const { isDesktop } = useLayout();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: isDesktop
          ? { display: "none" }
          : {
              backgroundColor: colors.surface,
              borderTopColor: colors.border,
              // Web needs a little more room: the icon box is taller than the old emoji glyph and would squeeze the label.
              height: Platform.OS === "web" ? 68 : 62,
              paddingBottom: 8,
              paddingTop: 8,
            },
        tabBarActiveTintColor: colors.brandLight,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: {
          ...typography.caption,
          fontWeight: "600",
        },
      }}
    >
      {NAV_ITEMS.map((item) => (
        <Tabs.Screen
          key={item.name}
          name={item.name}
          options={{
            title: item.label,
            tabBarAccessibilityLabel: item.tabLabel,
            tabBarIcon: ({ color, focused }) => (
              <Icon name={focused ? item.iconActive : item.icon} size={22} color={color as string} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
