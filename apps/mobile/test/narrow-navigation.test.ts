import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { resolveShell } from "../src/layout/breakpoints";
import { compactTabOrder, isTabActive } from "../src/navigation/items";

const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "..", file), "utf8");
const web = (width: number, segments: string[], signedIn = true) => resolveShell({ width, segments, signedIn, isWeb: true });

describe("narrow navigation", () => {
  it("shows the top bar below 1024px for signed-in app screens only", () => {
    expect(web(390, ["(tabs)", "inbox"]).topBar).toBe(true);
    expect(web(900, ["workflows"]).topBar).toBe(true);
    expect(web(1024, ["(tabs)", "inbox"]).topBar).toBe(false);
    expect(web(390, ["(tabs)", "inbox"], false).topBar).toBe(false);
    expect(web(390, ["(auth)", "sign-in"]).topBar).toBe(false);
    expect(resolveShell({ width: 390, segments: ["(tabs)", "inbox"], signedIn: true, isWeb: false }).topBar).toBe(false);
  });

  it("limits the bottom tabs to Board, Workflows, Triage", () => {
    expect(compactTabOrder({ brain: true })).toEqual(["brain", "workflows-tab", "triage"]);
    expect(compactTabOrder({ brain: false })).toEqual(["workflows-tab", "triage"]);
    const layout = read("app/(tabs)/_layout.tsx");
    // Hidden tabs must stay routable: `href: null` redirects them away in expo-router 58.
    expect(layout).not.toContain("href: null");
    expect(layout).toContain("tabBarButton: () => null");
    expect(layout).toContain('Platform.OS === "web" && !isDesktop');
  });

  it("selects a tab row only on its own route", () => {
    expect(isTabActive(["(tabs)", "inbox"], "inbox")).toBe(true);
    expect(isTabActive(["workflows"], "inbox")).toBe(false);
    expect(isTabActive(["search"], "inbox")).toBe(false);
    expect(isTabActive(["(tabs)"], "inbox")).toBe(false);
  });

  it("renders Workflows in the sidebar as a normal row selected only on /workflows", () => {
    const sidebar = read("src/components/Sidebar.tsx");
    expect(sidebar).toMatch(/<SidebarRow\s+label="Workflows"[\s\S]*active=\{segments\[0\] === "workflows"\}[\s\S]*href="\/workflows"/);
    expect(sidebar).not.toContain("add-circle-outline");
  });

  it("keeps the top bar controls labelled and the menu closable", () => {
    const bar = read("src/components/TopBar.tsx");
    for (const label of ['"Open menu"', '"Inbox"', '"Alerts"', '"Close menu"']) expect(bar).toContain(label);
    expect(bar).toContain("onRequestClose={onClose}");
    expect(bar).toContain("signOut");
    expect(read("app/_layout.tsx")).toContain("shell.topBar && <TopBar />");
  });
});
