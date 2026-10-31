import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  BREAKPOINT_DESKTOP,
  BREAKPOINT_TABLET,
  COLUMN_WIDTH,
  getLayoutMode,
  getShellKind,
  resolveShell,
} from "../src/layout/breakpoints";

const web = (width: number, segments: string[], signedIn = true) =>
  resolveShell({ width, segments, signedIn, isWeb: true });

describe("MM-042 responsive web shell", () => {
  it("maps widths to phone, tablet and desktop at 768 and 1024", () => {
    expect(getLayoutMode(0)).toBe("phone");
    expect(getLayoutMode(393)).toBe("phone");
    expect(getLayoutMode(BREAKPOINT_TABLET - 1)).toBe("phone");
    expect(getLayoutMode(BREAKPOINT_TABLET)).toBe("tablet");
    expect(getLayoutMode(BREAKPOINT_DESKTOP - 1)).toBe("tablet");
    expect(getLayoutMode(BREAKPOINT_DESKTOP)).toBe("desktop");
    expect(getLayoutMode(1920)).toBe("desktop");
  });

  it("classifies route groups", () => {
    expect(getShellKind(["(tabs)", "inbox"])).toBe("app");
    expect(getShellKind(["pr", "[owner]", "[repo]", "[number]"])).toBe("app");
    expect(getShellKind(["(auth)", "welcome"])).toBe("auth");
    expect(getShellKind(["(public)", "privacy"])).toBe("public");
    expect(getShellKind([])).toBe("bare");
    expect(getShellKind(["auth", "callback"])).toBe("bare");
  });

  it("keeps the phone column below 768px and never shows a sidebar", () => {
    const s = web(393, ["(tabs)", "inbox"]);
    expect(s.mode).toBe("phone");
    expect(s.sidebar).toBe(false);
    expect(s.columnMaxWidth).toBe(COLUMN_WIDTH.phone);
  });

  it("uses a 720px column with bottom tabs on tablets", () => {
    const s = web(900, ["(tabs)", "inbox"]);
    expect(s.mode).toBe("tablet");
    expect(s.sidebar).toBe(false);
    expect(s.columnMaxWidth).toBe(720);
  });

  it("shows the sidebar and a fluid workspace on desktop", () => {
    const s = web(1440, ["(tabs)", "inbox"]);
    expect(s.sidebar).toBe(true);
    expect(s.columnMaxWidth).toBeUndefined();
  });

  it("keeps readable line lengths for text-heavy screens on desktop", () => {
    expect(web(1440, ["pr", "[owner]", "[repo]", "[number]"]).columnMaxWidth).toBeUndefined();
    expect(web(1440, ["(tabs)", "settings"]).columnMaxWidth).toBeUndefined();
    expect(web(1440, ["(tabs)", "notifications"]).columnMaxWidth).toBeUndefined();
    expect(web(1440, ["(public)", "privacy"]).columnMaxWidth).toBe(COLUMN_WIDTH.reading);
  });

  it("centers public pages and auth screens without a sidebar", () => {
    const pub = web(1440, ["(public)", "terms"]);
    expect(pub.sidebar).toBe(false);
    const auth = web(1440, ["(auth)", "sign-in"], false);
    expect(auth.sidebar).toBe(false);
    expect(auth.card).toBe(true);
    expect(auth.columnMaxWidth).toBe(COLUMN_WIDTH.authCard);
  });

  it("hides the sidebar when signed out", () => {
    expect(web(1440, ["(tabs)", "inbox"], false).sidebar).toBe(false);
  });

  it("never changes the native layout", () => {
    const s = resolveShell({ width: 1366, segments: ["(tabs)", "inbox"], signedIn: true, isWeb: false });
    expect(s).toMatchObject({ mode: "phone", sidebar: false, card: false, columnMaxWidth: undefined });
  });
});

describe("MM-042 icons", () => {
  function collect(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) return collect(full);
      return e.name.endsWith(".tsx") ? [full] : [];
    });
  }

  it("uses no emoji as icons anywhere in app/ or src/", () => {
    const emoji = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2190}-\u{21FF}]|\u{FE0F}/u;
    // Arrows that are part of link labels and branch names are text, not icons.
    const allowed = /[→↗]/g;
    const root = path.resolve(__dirname, "..");
    for (const file of [...collect(path.join(root, "app")), ...collect(path.join(root, "src"))]) {
      const src = fs.readFileSync(file, "utf8").replace(allowed, "");
      expect(emoji.test(src), `${path.relative(root, file)} contains an emoji or symbol glyph`).toBe(false);
    }
  });
});
