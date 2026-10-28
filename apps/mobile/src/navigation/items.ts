import type { IconName } from "../components/Icon";

export interface NavItem {
  /** Tab screen name, also the last route segment. */
  name: "inbox" | "triage" | "notifications" | "settings";
  label: string;
  href: "/(tabs)/inbox" | "/(tabs)/triage" | "/(tabs)/notifications" | "/(tabs)/settings";
  icon: IconName;
  iconActive: IconName;
  /** Label announced for the bottom tab. */
  tabLabel: string;
}

/** Shared by the bottom tab bar and the desktop sidebar so the two never drift apart. */
export const NAV_ITEMS: NavItem[] = [
  { name: "inbox", label: "Inbox", href: "/(tabs)/inbox", icon: "file-tray-outline", iconActive: "file-tray", tabLabel: "Inbox tab" },
  { name: "triage", label: "Triage", href: "/(tabs)/triage", icon: "flash-outline", iconActive: "flash", tabLabel: "Triage deck tab" },
  { name: "notifications", label: "Alerts", href: "/(tabs)/notifications", icon: "notifications-outline", iconActive: "notifications", tabLabel: "Alerts tab" },
  { name: "settings", label: "Settings", href: "/(tabs)/settings", icon: "settings-outline", iconActive: "settings", tabLabel: "Settings tab" },
];
