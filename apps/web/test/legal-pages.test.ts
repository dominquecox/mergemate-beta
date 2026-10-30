import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * release.sh's legal gate curls /privacy, /terms and /support on the app host and needs support@mergemate.dev in the
 * raw HTML, so the SPA shell (rendered client-side) fails it. The pages ship as static files in apps/mobile/public,
 * which Expo copies verbatim into the export; Workers Assets serves <path>.html at /<path> before the SPA fallback.
 */
const PAGES = ["privacy", "terms", "support"] as const;
const DIST = new URL("../../mobile/dist/", import.meta.url);
const PUBLIC = new URL("../../mobile/public/", import.meta.url);

describe("static legal pages on the web host", () => {
  for (const page of PAGES) {
    it(`/${page} has support@mergemate.dev in the raw HTML of the source file`, () => {
      const html = readFileSync(new URL(`${page}.html`, PUBLIC), "utf8");
      expect(html).toContain("support@mergemate.dev");
      expect(html).not.toContain('<div id="root">');
    });

    // The export is built by `npm run export:web -w @mergemate/mobile`; this runs against it whenever it exists.
    it.runIf(existsSync(DIST))(`/${page} survives into the built output`, () => {
      const html = readFileSync(new URL(`${page}.html`, DIST), "utf8");
      expect(html).toContain("support@mergemate.dev");
      expect(html).not.toBe(readFileSync(new URL("index.html", DIST), "utf8"));
    });
  }

  it("keeps wrangler asset routing on the default html handling so /privacy resolves to privacy.html", () => {
    const toml = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
    expect(toml).not.toMatch(/html_handling/);
  });
});
