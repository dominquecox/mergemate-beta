import React, { useEffect, useRef, useState } from "react";
import { Animated, Modal, Pressable, View } from "react-native";
import { useRouter, useSegments } from "expo-router";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { useAlerts } from "../context/AlertsContext";
import { useFeatureFlags } from "../hooks/useFeatureFlags";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { useTopBarActions } from "../context/TopBarActionsContext";
import { Text } from "./Text";
import { Icon, type IconName } from "./Icon";
import { CaptureSheet } from "./CaptureSheet";
import { isDestinationActive, menuDestinations } from "../navigation/items";

const MENU_WIDTH = 288;

/** Global header for narrow web layouts: menu button on the left; Inbox, Alerts and AI actions on the right. */
export function TopBar() {
  const router = useRouter();
  const { colors, typography } = useTheme();
  const { unreadCount } = useAlerts();
  const flags = useFeatureFlags();
  const { actions } = useTopBarActions();
  const [menuOpen, setMenuOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const menuButton = useRef<React.ElementRef<typeof Pressable>>(null);

  const closeMenu = () => {
    setMenuOpen(false);
    requestAnimationFrame(() => (menuButton.current as unknown as { focus?: () => void } | null)?.focus?.());
  };

  const iconButton = (name: IconName, label: string, onPress: () => void, badge = 0) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={badge > 0 ? `${label} (${badge} unread)` : label}
      onPress={onPress}
      style={({ pressed }) => ({ width: 44, height: 44, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.8 : 1 })}
    >
      <Icon name={name} size={22} color={colors.textSecondary} />
      {badge > 0 && (
        <View
          style={{
            position: "absolute",
            top: 4,
            right: 2,
            minWidth: 18,
            height: 18,
            paddingHorizontal: 4,
            borderRadius: 999,
            backgroundColor: colors.statusAlertBg,
            borderWidth: 1,
            borderColor: colors.statusAlert,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={[typography.caption, { color: colors.statusAlert, fontWeight: "600", fontSize: 10, lineHeight: 12 }]}>{badge > 99 ? "99+" : badge}</Text>
        </View>
      )}
    </Pressable>
  );

  return (
    <View
      style={{
        minHeight: 56,
        paddingHorizontal: 8,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: colors.background,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      <Pressable
        ref={menuButton}
        accessibilityRole="button"
        accessibilityLabel="Open menu"
        accessibilityState={{ expanded: menuOpen }}
        aria-haspopup="dialog"
        onPress={() => setMenuOpen(true)}
        style={({ pressed }) => ({ width: 44, height: 44, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.8 : 1 })}
      >
        <Icon name="menu" size={24} color={colors.text} />
      </Pressable>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        {actions}
        {iconButton("file-tray-outline", "Inbox", () => router.push("/(tabs)/inbox"))}
        {iconButton("notifications-outline", "Alerts", () => router.push("/(tabs)/notifications"), unreadCount)}
        {iconButton("add-circle-outline", "Capture", () => setCaptureOpen(true))}
      </View>
      <CaptureSheet open={captureOpen} onClose={() => setCaptureOpen(false)} />
      <SideMenu open={menuOpen} onClose={closeMenu} unreadCount={unreadCount} brain={!!flags.brain} />
    </View>
  );
}

function SideMenu({ open, onClose, unreadCount, brain }: { open: boolean; onClose: () => void; unreadCount: number; brain: boolean }) {
  const router = useRouter();
  const segments = useSegments() as readonly string[];
  const { colors, typography, themeMode, setThemeMode, isDark } = useTheme();
  const { user, isDemo, signOut } = useAuth();
  const reducedMotion = useReducedMotion();
  const slide = useRef(new Animated.Value(-MENU_WIDTH)).current;

  useEffect(() => {
    if (!open) return;
    if (reducedMotion) {
      slide.setValue(0);
      return;
    }
    slide.setValue(-MENU_WIDTH);
    Animated.timing(slide, { toValue: 0, duration: 180, useNativeDriver: false }).start();
  }, [open, reducedMotion, slide]);

  const go = (href: "/search" | "/(tabs)/settings") => {
    onClose();
    router.push(href);
  };

  const row = (icon: IconName, label: string, onPress: () => void, accessibilityLabel = label, role: "button" | "link" = "button", selected = false, badge = 0) => (
    <Pressable
      key={label}
      accessibilityRole={role}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={selected ? { selected: true } : undefined}
      aria-current={selected ? "page" : undefined}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44,
        paddingHorizontal: 12,
        borderRadius: 10,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        backgroundColor: selected ? colors.brandSubtle : pressed ? colors.surfaceElevated : "transparent",
      })}
    >
      <Icon name={icon} size={19} color={selected ? colors.brandLight : colors.textMuted} />
      <Text style={[typography.body, { flex: 1, color: selected ? colors.text : colors.textSecondary, fontWeight: selected ? "600" : "500" }]}>{label}</Text>
      {badge > 0 && <Text style={[typography.caption, { color: colors.statusAlert, fontWeight: "600" }]}>{badge > 99 ? "99+" : badge}</Text>}
    </Pressable>
  );
  const navigate = (href: Parameters<typeof router.navigate>[0]) => {
    onClose();
    router.navigate(href);
  };

  return (
    <Modal visible={open} transparent animationType="none" onRequestClose={onClose}>
      <View style={{ flex: 1, flexDirection: "row" }}>
        <Animated.View
          accessibilityViewIsModal
          accessibilityLabel="Menu"
          style={{
            width: MENU_WIDTH,
            maxWidth: "86%",
            backgroundColor: colors.surface,
            borderRightWidth: 1,
            borderRightColor: colors.border,
            paddingHorizontal: 12,
            paddingTop: 16,
            paddingBottom: 16,
            gap: 4,
            transform: [{ translateX: slide }],
          }}
        >
          {menuDestinations({ brain }).map((item) => {
            const badge = item.key === "notifications" ? unreadCount : 0;
            return row(item.icon, item.label, () => navigate(item.href), badge > 0 ? `${item.label} (${badge} unread)` : item.label, "link", isDestinationActive(segments, item.key), badge);
          })}
          <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 8 }} />
          {row("search", "Search", () => go("/search"), "Search pull requests")}
          {row("settings-outline", "Settings", () => go("/(tabs)/settings"), "Settings", "link")}
          {row(isDark ? "sunny-outline" : "moon-outline", isDark ? "Light theme" : "Dark theme", () => setThemeMode(isDark ? "light" : "dark"), `Switch to ${isDark ? "light" : "dark"} theme, currently ${themeMode}`)}
          <View style={{ flex: 1 }} />
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Open personal workspace dashboard"
            onPress={() => go("/(tabs)/settings")}
            style={{
              minHeight: 58,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 10,
              paddingHorizontal: 10,
              paddingVertical: 8,
              backgroundColor: colors.background,
            }}
          >
            <Icon name="person-outline" size={18} color={colors.brandLight} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={[typography.subhead, { color: colors.text, fontWeight: "600" }]}>
                {user?.name || user?.login || "Your account"}
              </Text>
              <Text numberOfLines={1} style={[typography.caption, { color: colors.textSecondary }]}>
                {isDemo ? "Demo workspace" : "Personal workspace"}
              </Text>
            </View>
          </Pressable>
          {row("log-out-outline", "Sign out", () => {
            onClose();
            void signOut().then(() => router.replace("/(auth)/sign-in"));
          })}
        </Animated.View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close menu" onPress={onClose} style={{ flex: 1, backgroundColor: "rgba(11, 15, 23, 0.6)" }} />
      </View>
    </Modal>
  );
}
