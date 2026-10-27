import React from "react";
import { Tabs } from "expo-router";
import { Text } from "react-native";
import { useTheme } from "../../src/context/ThemeContext";

export default function TabsLayout() {
  const { colors, typography } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 62,
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
      <Tabs.Screen
        name="inbox"
        options={{
          title: "Inbox",
          tabBarAccessibilityLabel: "Inbox tab",
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 18 }} accessibilityElementsHidden>
              📥
            </Text>
          ),
        }}
      />
      <Tabs.Screen
        name="triage"
        options={{
          title: "Triage",
          tabBarAccessibilityLabel: "Triage deck tab",
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 18 }} accessibilityElementsHidden>
              ⚡
            </Text>
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: "Alerts",
          tabBarAccessibilityLabel: "Alerts tab",
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 18 }} accessibilityElementsHidden>
              🔔
            </Text>
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarAccessibilityLabel: "Settings tab",
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 18 }} accessibilityElementsHidden>
              ⚙
            </Text>
          ),
        }}
      />
    </Tabs>
  );
}
