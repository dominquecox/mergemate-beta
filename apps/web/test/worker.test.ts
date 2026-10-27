import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import worker, { buildCsp, validApiOrigin, type Env } from "../src/index";

const INDEX = "<!doctype html><title>MergeMate</title>";

/** Stand-in for the assets binding: exact files, plus the single-page-app fallback for everything else. */
function assets(): Fetcher {
  return {
    async fetch(input: RequestInfo | URL): Promise<Response> {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.pathname === "/_expo/static/js/web/entry-abc123.js") {
        return new Response("console.log(1)", { headers: { "Content-Type": "text/javascript", "Cache-Control": "public, max-age=0, must-revalidate" } });
      }
      if (url.pathname === "/favicon.ico") {
        return new Response("ico", { headers: { "Content-Type": "image/x-icon" } });
      }
      return new Response(INDEX, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    },
  } as unknown as Fetcher;
}

function env(apiOrigin = "https://api-dev.mergemate.dev"): Env {
  return { ASSETS: assets(), API_ORIGIN: apiOrigin };
}

const get = (path: string, e: Env = env(), init?: RequestInit) => worker.fetch(new Request(`https://dev.mergemate.dev${path}`, init), e);

function expectSecurityHeaders(res: Response, apiOrigin = "https://api-dev.mergemate.dev") {
  expect(res.headers.get("Strict-Transport-Security")).toBe("max-age=31536000; includeSubDomains");
  expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  expect(res.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  expect(res.headers.get("Permissions-Policy")).toBe("camera=(), microphone=(), geolocation=()");
  expect(res.headers.get("Content-Security-Policy")).toBe(buildCsp(apiOrigin));
}

describe("web worker headers", () => {
  it("adds security headers and no-cache to HTML", async () => {
    const res = await get("/");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(INDEX);
    expectSecurityHeaders(res);
    expect(res.headers.get("Cache-Control")).toBe("no-cache");
  });

  it("adds security headers and immutable caching to hashed /_expo/ assets", async () => {
    const res = await get("/_expo/static/js/web/entry-abc123.js");
    expect(res.status).toBe(200);
    expectSecurityHeaders(res);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
  });

  it("does not mark a missing /_expo/ path (HTML fallback) immutable", async () => {
    const res = await get("/_expo/static/js/web/gone.js");
    expect(res.headers.get("Content-Type")).toContain("text/html");
    expect(res.headers.get("Cache-Control")).toBe("no-cache");
  });

  it("leaves other assets with the asset layer's caching but still adds security headers", async () => {
    const res = await get("/favicon.ico");
    expectSecurityHeaders(res);
    expect(res.headers.get("Cache-Control")).not.toBe("public, max-age=31536000, immutable");
  });

  it("falls back to the app shell for client routes", async () => {
    const res = await get("/pr/dominquecox/mergemate/31");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(INDEX);
    expectSecurityHeaders(res);
  });

  it("answers /health with { ok: true } and the same headers, uncached", async () => {
    const res = await get("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expectSecurityHeaders(res);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("rejects other methods with headers", async () => {
    const res = await get("/", env(), { method: "POST", body: "x" });
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("GET, HEAD");
    expectSecurityHeaders(res);
  });
});

describe("CSP", () => {
  it("never allows inline or eval scripts, frames or a wildcard", () => {
    const csp = buildCsp("https://api.mergemate.dev");
    const directive = (name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";
    expect(directive("script-src")).toBe("script-src 'self' https://challenges.cloudflare.com");
    expect(directive("script-src")).not.toMatch(/unsafe-inline|unsafe-eval/);
    expect(directive("frame-src")).toBe("frame-src https://challenges.cloudflare.com");
    expect(directive("frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive("base-uri")).toBe("base-uri 'none'");
    expect(directive("form-action")).toBe("form-action 'self'");
    expect(directive("img-src")).toBe("img-src 'self' data: https://avatars.githubusercontent.com");
    expect(directive("style-src")).toBe("style-src 'self' 'unsafe-inline'");
    expect(directive("font-src")).toBe("font-src 'self' data:");
    expect(csp).not.toContain("*");
  });

  it.each([
    ["https://api-dev.mergemate.dev"],
    ["https://api.mergemate.dev"],
    ["http://localhost:8787"],
  ])("limits connect-src to self and %s", async (origin) => {
    const res = await get("/", env(origin));
    expect(res.headers.get("Content-Security-Policy")).toContain(`connect-src 'self' ${origin};`);
    expectSecurityHeaders(res, origin);
  });

  it("matches API_ORIGIN in wrangler.toml for each environment", () => {
    const toml = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
    const origin = (table: string) => {
      const section = toml.split(/^\[/m).find((s) => s.startsWith(`${table}]`)) ?? "";
      return /^API_ORIGIN = "([^"]+)"$/m.exec(section)?.[1];
    };
    expect(origin("vars")).toBe("http://localhost:8787");
    expect(origin("env.dev.vars")).toBe("https://api-dev.mergemate.dev");
    expect(origin("env.production.vars")).toBe("https://api.mergemate.dev");
  });

  it("serves production only from app.mergemate.dev, never workers.dev or previews", () => {
    const toml = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
    const section = toml.split(/^\[/m).find((s) => s.startsWith("env.production]")) ?? "";
    expect(section).toContain('name = "mergemate-web"');
    expect(section).toContain('routes = [{ pattern = "app.mergemate.dev", custom_domain = true }]');
    expect(section).toMatch(/^workers_dev = false$/m);
    expect(section).toMatch(/^preview_urls = false$/m);
  });

  it("fails closed when API_ORIGIN is missing or not a bare origin", async () => {
    const missing = await get("/", { ASSETS: assets() });
    expect(missing.status).toBe(500);
    expect(missing.headers.get("Content-Security-Policy")).toBeNull();
    for (const bad of ["", "api.mergemate.dev", "https://api.mergemate.dev/v1", "https://a.dev; script-src *", "javascript:alert(1)"]) {
      const res = await get("/", env(bad));
      expect(res.status).toBe(500);
      expect(res.headers.get("Content-Security-Policy")).toBeNull();
      expect(res.headers.get("Strict-Transport-Security")).toBe("max-age=31536000; includeSubDomains");
    }
    expect(validApiOrigin("https://api.mergemate.dev")).toBe("https://api.mergemate.dev");
  });
});
