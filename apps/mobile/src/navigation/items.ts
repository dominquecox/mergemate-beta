import type { IconName } from "../components/Icon";

export interface NavItem {
  /** Tab screen name, also the last route segment. */
  name: "inbox" | "triage" | "notifications" | "settings" | "brain";
  label: string;
  href: "/(tabs)/inbox" | "/(tabs)/triage" | "/(tabs)/notifications" | "/(tabs)/settings" | "/(tabs)/brain";
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

/** The Board entry. Shown only while the "brain" flag is on. */
export const BRAIN_NAV_ITEM: NavItem = { name: "brain", label: "Board", href: "/(tabs)/brain", icon: "albums-outline", iconActive: "albums", tabLabel: "Board tab" };

/** Bottom tab order on narrow web: only the three main features. The other tab routes stay reachable, just hidden from the bar. */
export function compactTabOrder(flags: { brain?: boolean }): Array<"brain" | "workflows-tab" | "triage"> {
  return flags.brain ? ["brain", "workflows-tab", "triage"] : ["workflows-tab", "triage"];
}

/** A nav row is selected only on its own tab route; other pages (for example /workflows) select nothing here. */
export function isTabActive(segments: readonly string[], name: NavItem["name"]): boolean {
  return segments[0] === "(tabs)" && segments[1] === name;
}

/** Navigation for the current flags: Board sits just before Settings when it is on. */
export function navItemsFor(flags: { brain?: boolean }): NavItem[] {
  if (!flags.brain) return NAV_ITEMS;
  return [...NAV_ITEMS.filter((item) => item.name !== "settings"), BRAIN_NAV_ITEM, ...NAV_ITEMS.filter((item) => item.name === "settings")];
}

export interface MenuDestination {
  key: "brain" | "workflows" | "triage" | "inbox" | "notifications" | "notes";
  label: string;
  href: "/(tabs)/brain" | "/workflows" | "/(tabs)/triage" | "/(tabs)/inbox" | "/(tabs)/notifications" | "/notes";
  icon: IconName;
}

/** Every main destination, for the narrow-web side menu, so no page is a dead end (Workflows has no bottom tab bar). */
export function menuDestinations(flags: { brain?: boolean }): MenuDestination[] {
  return [
    ...(flags.brain ? [{ key: "brain", label: "Board", href: "/(tabs)/brain", icon: "albums-outline" } as const] : []),
    { key: "workflows", label: "Workflows", href: "/workflows", icon: "git-network-outline" },
    { key: "triage", label: "Triage", href: "/(tabs)/triage", icon: "flash-outline" },
    { key: "inbox", label: "Inbox", href: "/(tabs)/inbox", icon: "file-tray-outline" },
    { key: "notifications", label: "Alerts", href: "/(tabs)/notifications", icon: "notifications-outline" },
    { key: "notes", label: "Notes", href: "/notes", icon: "create-outline" },
  ];
}

/** Whether the current route is this destination. Workflows counts both its page and its tab. */
export function isDestinationActive(segments: readonly string[], key: MenuDestination["key"]): boolean {
  if (key === "notes") return segments[0] === "notes";
  if (key === "workflows") return segments[0] === "workflows" || (segments[0] === "(tabs)" && segments[1] === "workflows-tab");
  return segments[0] === "(tabs)" && segments[1] === key;
}

/** Where Back goes when there is no history: the Board when it is on, otherwise the Inbox. */
export function homeHref(flags: { brain?: boolean }): "/(tabs)/brain" | "/(tabs)/inbox" {
  return flags.brain ? "/(tabs)/brain" : "/(tabs)/inbox";
}
