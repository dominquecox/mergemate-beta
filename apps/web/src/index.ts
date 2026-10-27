/**
 * Serves the Expo web export (apps/mobile/dist) with the security headers from specs/SECURITY.md section 8.
 * The assets binding does the file serving and the single-page-app fallback; this Worker runs first on every
 * request so no response, including errors and the fallback page, leaves without headers.
 */

export interface Env {
  ASSETS: Fetcher;
  /** Origin of the API this build talks to, for CSP connect-src. Set per environment in wrangler.toml. */
  API_ORIGIN?: string;
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
 */
export function buildCsp(apiOrigin: string): string {
  return [
    "default-src 'self'",
    "script-src 'self' https://challenges.cloudflare.com",
    "frame-src https://challenges.cloudflare.com",
    `connect-src 'self' ${apiOrigin}`,
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
    if (pathname === "/health") {
      return withHeaders(Response.json({ ok: true }), csp, { "Cache-Control": "no-store" });
    }

    const response = await env.ASSETS.fetch(request);
    const isHtml = (response.headers.get("Content-Type") ?? "").toLowerCase().startsWith("text/html");
    if (isHtml) return withHeaders(response, csp, { "Cache-Control": "no-cache" });
    // Only real hashed build output is immutable. A missing /_expo/ file falls back to HTML (above) or errors.
    if (response.ok && pathname.startsWith("/_expo/")) {
      return withHeaders(response, csp, { "Cache-Control": "public, max-age=31536000, immutable" });
    }
    return withHeaders(response, csp);
  },
} satisfies ExportedHandler<Env>;
