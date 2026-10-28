/**
 * Serves the Expo web export (apps/mobile/dist) with the security headers from specs/SECURITY.md section 8,
 * plus /.well-known/assetlinks.json for Android App Links sign-in callback verification (specs/ANDROID.md).
 * The assets binding does the file serving and the single-page-app fallback; this Worker runs first on every
 * request so no response, including errors and the fallback page, leaves without headers.
 */

export interface Env {
  ASSETS: Fetcher;
  /** Origin of the API this build talks to, for CSP connect-src. Set per environment in wrangler.toml. */
  API_ORIGIN?: string;
  /**
   * Comma-separated SHA-256 signing certificate fingerprints from Play App Signing (and optional debug keystore
   * on dev). Placeholder until the owner supplies the release SHA-256 from Play Console -> App integrity.
   */
  ANDROID_SHA256_FINGERPRINTS?: string;
}

export const ANDROID_PACKAGE_PROD = "dev.mergemate.app";
export const ANDROID_PACKAGE_DEV = "dev.mergemate.app.dev";
export const PLACEHOLDER_ANDROID_SHA256 =
  "00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00";

const SHA256_FINGERPRINT_RE = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/i;

export interface AssetLinkEntry {
  relation: ["delegate_permission/common.handle_all_urls"];
  target: {
    namespace: "android_app";
    package_name: string;
    sha256_cert_fingerprints: string[];
  };
}

/** Validates configured SHA-256 certificate fingerprints, falling back to the placeholder until Play App Signing is set. */
export function parseAndroidFingerprints(raw: string | undefined): {
  fingerprints: string[];
  isPlaceholder: boolean;
} {
  if (!raw) {
    return { fingerprints: [PLACEHOLDER_ANDROID_SHA256], isPlaceholder: true };
  }
  const valid = Array.from(
    new Set(
      raw
        .split(/[\s,]+/)
        .map((s) => s.trim().toUpperCase())
        .filter((s) => SHA256_FINGERPRINT_RE.test(s)),
    ),
  );
  const nonPlaceholder = valid.filter((s) => s !== PLACEHOLDER_ANDROID_SHA256);
  if (nonPlaceholder.length === 0) {
    return { fingerprints: [PLACEHOLDER_ANDROID_SHA256], isPlaceholder: true };
  }
  return { fingerprints: nonPlaceholder, isPlaceholder: false };
}

/**
 * Digital Asset Links statement list for Android App Links (/auth/callback).
 * Production (api.mergemate.dev) authorizes dev.mergemate.app only; dev/local also authorizes dev.mergemate.app.dev.
 */
export function buildAssetLinks(apiOrigin: string, rawFingerprints?: string): {
  entries: AssetLinkEntry[];
  isPlaceholder: boolean;
} {
  const { fingerprints, isPlaceholder } = parseAndroidFingerprints(rawFingerprints);
  const packages =
    apiOrigin === "https://api.mergemate.dev"
      ? [ANDROID_PACKAGE_PROD]
      : [ANDROID_PACKAGE_PROD, ANDROID_PACKAGE_DEV];
  const entries: AssetLinkEntry[] = packages.map((packageName) => ({
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: packageName,
      sha256_cert_fingerprints: fingerprints,
    },
  }));
  return { entries, isPlaceholder };
}

const HSTS = "max-age=31536000; includeSubDomains";

const STATIC_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": HSTS,
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

/**
 * script-src never allows inline code or eval. style-src keeps 'unsafe-inline' because the Expo export ships an
 * inline <style id="expo-reset"> and react-native-web injects its stylesheet and style attributes at runtime.
 * Cloudflare Web Analytics (auto-injected at the edge, kept on by the owner) needs its beacon script and report host.
 */
export function buildCsp(apiOrigin: string): string {
  return [
    "default-src 'self'",
    "script-src 'self' https://challenges.cloudflare.com https://static.cloudflareinsights.com",
    "frame-src https://challenges.cloudflare.com",
    `connect-src 'self' ${apiOrigin} https://cloudflareinsights.com`,
    "img-src 'self' data: https://avatars.githubusercontent.com",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/** Returns the origin when API_ORIGIN is exactly an http(s) origin, otherwise null (no path, query or spaces). */
export function validApiOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin === value ? value : null;
  } catch {
    return null;
  }
}

function withHeaders(response: Response, csp: string, extra: Record<string, string> = {}): Response {
  const out = new Response(response.body, response);
  for (const [name, value] of Object.entries(STATIC_HEADERS)) out.headers.set(name, value);
  out.headers.set("Content-Security-Policy", csp);
  for (const [name, value] of Object.entries(extra)) out.headers.set(name, value);
  return out;
}

/** Identifies sensitive file probe paths that must never fall back to index.html and must 404. */
export function isSensitiveProbe(pathname: string): boolean {
  if (pathname.startsWith("/.") && pathname !== "/.well-known/assetlinks.json") return true;
  if (pathname.endsWith(".map")) return true;
  if (["/package.json", "/package-lock.json", "/tsconfig.json", "/wrangler.toml", "/wrangler.jsonc", "/README.md"].includes(pathname)) return true;
  if (pathname.startsWith("/src/") || pathname.startsWith("/migrations/") || pathname.startsWith("/apps/") || pathname.startsWith("/node_modules/")) return true;
  return false;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const apiOrigin = validApiOrigin(env.API_ORIGIN);
    if (!apiOrigin) {
      // Fail closed: a missing or malformed origin must never widen connect-src.
      return new Response("Misconfigured", { status: 500, headers: { ...STATIC_HEADERS, "Cache-Control": "no-store" } });
    }
    const csp = buildCsp(apiOrigin);

    if (request.method !== "GET" && request.method !== "HEAD") {
      return withHeaders(new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } }), csp, {
        "Cache-Control": "no-store",
      });
    }

    const { pathname } = new URL(request.url);
    const legacyPost = /^\/(?:news|changelog)\/([a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?)$/.exec(pathname);
    if (legacyPost) return withHeaders(new Response(null, {status:302,headers:{Location:`/posts/${legacyPost[1]}`}}),csp,{"Cache-Control":"no-cache"});

    if (pathname === "/health") {
      return withHeaders(Response.json({ ok: true }), csp, { "Cache-Control": "no-store" });
    }

    if (pathname === "/.well-known/assetlinks.json") {
      const { entries, isPlaceholder } = buildAssetLinks(apiOrigin, env.ANDROID_SHA256_FINGERPRINTS);
      return withHeaders(Response.json(entries), csp, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": isPlaceholder ? "no-store" : "public, max-age=3600",
      });
    }

    if (isSensitiveProbe(pathname)) {
      return withHeaders(new Response("Not Found", { status: 404 }), csp, { "Cache-Control": "no-store" });
    }

    const response = await env.ASSETS.fetch(request);
    if (pathname === "/sw.js" || pathname === "/service-worker.js") {
      return withHeaders(response, csp, { "Service-Worker-Allowed": "/", "Cache-Control": "no-cache" });
    }

    const isHtml = (response.headers.get("Content-Type") ?? "").toLowerCase().startsWith("text/html");
    if (isHtml) return withHeaders(response, csp, { "Cache-Control": "no-cache" });
    // Only real hashed build output is immutable. A missing /_expo/ file falls back to HTML (above) or errors.
    if (response.ok && pathname.startsWith("/_expo/")) {
      return withHeaders(response, csp, { "Cache-Control": "public, max-age=31536000, immutable" });
    }
    return withHeaders(response, csp);
  },
} satisfies ExportedHandler<Env>;
