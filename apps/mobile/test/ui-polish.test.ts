import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { palette } from "../src/theme";

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

function contrastRatio(fg: string, bg: string): number {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function collectFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectFiles(full));
    } else if (entry.name.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

describe("MM-035 UI Polish & Accessibility", () => {
  it("enforces >= 4.5:1 WCAG AA contrast across light and dark themes", () => {
    for (const mode of ["dark", "light"] as const) {
      const c = palette[mode];
      const surfaces = [c.background, c.surface, c.surfaceElevated];
      const texts = [c.text, c.textSecondary, c.textMuted, c.brandLight];
      for (const bg of surfaces) {
        for (const fg of texts) {
          expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
        }
      }
      expect(contrastRatio(c.riskHigh, c.riskHighBg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(c.riskMedium, c.riskMediumBg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(c.riskLow, c.riskLowBg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(c.secretWarning, c.secretWarningBg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(c.demoBadge, c.demoBadgeBg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio("#FFFFFF", c.brand)).toBeGreaterThanOrEqual(4.5);
    }
  });

  // A route whose only job is to send you to another screen loads nothing, so it has no data states.
  // A tab placeholder whose press listener navigates elsewhere renders nothing, so it has no states to show.
  const isPlaceholderOnly = (src: string) => /^(\/\*\*[\s\S]*?\*\/\s*)?export default function \w+\(\) \{\s*return null;\s*\}\s*$/.test(src);
  const isRedirectOnly = (src: string) => /^import \{ Redirect \} from "expo-router";\s*(\/\*\*[^*]*\*\/\s*)?export default function \w+\(\) \{\s*return <Redirect href="[^"]+" \/>;\s*\}\s*$/.test(src);

  it("ensures every screen in app/ includes LoadingState, EmptyState, and ErrorState", () => {
    const appDir = path.resolve(__dirname, "../app");
    const screens = collectFiles(appDir).filter(
      // Legal pages load nothing; they hand off to the official pages on mergemate.dev.
      (f) => !f.endsWith("_layout.tsx") && !f.endsWith("+html.tsx") && !f.endsWith("cancelled.tsx") && !fs.readFileSync(f, "utf8").includes("<LegalPage ") && !isRedirectOnly(fs.readFileSync(f, "utf8")) && !isPlaceholderOnly(fs.readFileSync(f, "utf8"))
    );
    expect(screens.length).toBeGreaterThanOrEqual(17);
    for (const file of screens) {
      const route = fs.readFileSync(file, "utf8");
      // Public reader routes delegate their real state branches to a shared component.
      // Capture routes delegate to the screenshot screen or the shared capture-note screen.
      const src = route.includes('components/PublicPostReader')
        ? route + fs.readFileSync(path.resolve(__dirname, '../src/components/PublicPostReader.tsx'), 'utf8')
        : route.includes("from '../highlight'")
          ? route + fs.readFileSync(path.resolve(__dirname, '../app/highlight.tsx'), 'utf8')
          : route.includes('brain/CaptureNoteScreen')
            ? route + fs.readFileSync(path.resolve(__dirname, '../src/brain/CaptureNoteScreen.tsx'), 'utf8')
            : route;
      expect(src, `${path.basename(file)} missing LoadingState`).toContain("LoadingState");
      expect(src, `${path.basename(file)} missing EmptyState`).toContain("EmptyState");
      expect(src, `${path.basename(file)} missing ErrorState`).toContain("ErrorState");
    }
  });

  it("ships clean generated app icon, adaptive icon, splash, favicon, and logos", () => {
    const assetsDir = path.resolve(__dirname, "../assets");
    const expected = [
      "icon.png",
      "adaptive-icon.png",
      "splash.png",
      "favicon.png",
      "logo-dark.png",
      "logo-light.png",
    ];
    for (const file of expected) {
      const full = path.join(assetsDir, file);
      expect(fs.existsSync(full), `Missing asset ${file}`).toBe(true);
      const stat = fs.statSync(full);
      expect(stat.size).toBeGreaterThan(1024);
    }
  });
});
