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
   * on dev). Must match the actual package signing certificate; missing/invalid values return 503.
   */
  ANDROID_SHA256_FINGERPRINTS?: string;
  /** Actual application-identifier entitlement (Apple prefix + bundle identifier), never a signing key. */
  IOS_APP_ID?: string;
}

export const ANDROID_PACKAGE_PROD = "dev.mergemate.app";
export const ANDROID_PACKAGE_DEV = "dev.mergemate.app.dev";
const SHA256_FINGERPRINT_RE = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/i;

export interface AssetLinkEntry {
  relation: ["delegate_permission/common.handle_all_urls"];
  target: {
    namespace: "android_app";
    package_name: string;
    sha256_cert_fingerprints: string[];
  };
}

/** Missing, malformed or all-zero configuration never publishes a fabricated association. */
export function parseAndroidFingerprints(raw: string | undefined): { fingerprints: string[]; configured: boolean } {
  const fingerprints = [...new Set((raw ?? "").trim().split(/[\s,]+/).filter(Boolean).map(s => s.toUpperCase()))];
  const configured = fingerprints.length > 0 && fingerprints.every(s => SHA256_FINGERPRINT_RE.test(s) && !/^(00:){31}00$/.test(s));
  return { fingerprints: configured ? fingerprints : [], configured };
}

export function buildAssetLinks(apiOrigin: string, rawFingerprints?: string): { entries: AssetLinkEntry[]; configured: boolean } {
  const { fingerprints, configured } = parseAndroidFingerprints(rawFingerprints);
  const packageName = apiOrigin === "https://api.mergemate.dev" ? ANDROID_PACKAGE_PROD : ANDROID_PACKAGE_DEV;
  return { configured, entries: configured ? [{ relation: ["delegate_permission/common.handle_all_urls"], target: {
    namespace: "android_app", package_name: packageName, sha256_cert_fingerprints: fingerprints,
  } }] : [] };
}

export function buildAppleAssociation(appId?: string) {
  if (!appId || !/^[A-Z0-9]{10}\.dev\.mergemate\.app$/.test(appId)) return null;
  return { applinks: { apps: [], details: [{ appID: appId, paths: ["/auth/callback", "/pr/*"] }] } };
}

const HSTS = "max-age=31536000; includeSubDomains";

const STATIC_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": HSTS,
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(self), geolocation=()",
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
    `connect-src 'self' blob: ${apiOrigin} https://cloudflareinsights.com`,
    "img-src 'self' data: blob: https://avatars.githubusercontent.com",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "media-src 'self' blob:",
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

function associationResponse(request: Request, body: unknown, configured: boolean, csp: string) {
  return withHeaders(new Response(request.method === "HEAD" ? null : JSON.stringify(body), { status: configured ? 200 : 503 }), csp, {
    "Content-Type": "application/json; charset=utf-8", "Cache-Control": configured ? "public, max-age=3600" : "no-store",
  });
}

/** Identifies sensitive file probe paths that must never fall back to index.html and must 404. */
export function isSensitiveProbe(pathname: string): boolean {
  if (pathname.startsWith("/.") && !["/.well-known/assetlinks.json", "/.well-known/apple-app-site-association"].includes(pathname)) return true;
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
      const { entries, configured } = buildAssetLinks(apiOrigin, env.ANDROID_SHA256_FINGERPRINTS);
      return associationResponse(request, configured ? entries : { error: "association_not_configured" }, configured, csp);
    }
    if (pathname === "/.well-known/apple-app-site-association") {
      const association = buildAppleAssociation(env.IOS_APP_ID);
      return associationResponse(request, association ?? { error: "association_not_configured" }, Boolean(association), csp);
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
