import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { homeHref, isDestinationActive, menuDestinations } from "../src/navigation/items";

describe("narrow-web side menu destinations", () => {
  it("lists every main destination, Board first when it is on", () => {
    expect(menuDestinations({ brain: true }).map((item) => item.label)).toEqual(["Board", "Workflows", "Triage", "Inbox", "Alerts"]);
    expect(menuDestinations({ brain: false }).map((item) => item.label)).toEqual(["Workflows", "Triage", "Inbox", "Alerts"]);
    expect(menuDestinations({ brain: true }).find((item) => item.key === "workflows")?.href).toBe("/workflows");
  });

  it("marks the current page, including Workflows outside the tabs", () => {
    expect(isDestinationActive(["workflows"], "workflows")).toBe(true);
    expect(isDestinationActive(["(tabs)", "workflows-tab"], "workflows")).toBe(true);
    expect(isDestinationActive(["(tabs)", "inbox"], "inbox")).toBe(true);
    expect(isDestinationActive(["workflows"], "inbox")).toBe(false);
    expect(isDestinationActive(["search"], "triage")).toBe(false);
  });

  it("sends Back to the Board, or the Inbox when the Board is off", () => {
    expect(homeHref({ brain: true })).toBe("/(tabs)/brain");
    expect(homeHref({ brain: false })).toBe("/(tabs)/inbox");
  });

  it("renders the destinations at the top of the side menu, and Workflows falls back home when there is no history", () => {
    const topBar = readFileSync(join(__dirname, "..", "src", "components", "TopBar.tsx"), "utf8");
    expect(topBar.indexOf("menuDestinations({ brain })")).toBeGreaterThan(-1);
    expect(topBar.indexOf("menuDestinations({ brain })")).toBeLessThan(topBar.indexOf('row("search", "Search"'));
    const workflows = readFileSync(join(__dirname, "..", "app", "workflows.tsx"), "utf8");
    expect(workflows).toContain("onBack={() => (router.canGoBack() ? router.back() : router.replace(homeHref(flags)))}");
  });
});
