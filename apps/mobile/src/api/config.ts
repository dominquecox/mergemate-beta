/**
 * Where the app talks to. The base URL comes from EXPO_PUBLIC_API_BASE_URL:
 *   local       http://localhost:8787
 *   development https://api-dev.mergemate.dev
 *   production  https://api.mergemate.dev
 *
 * Unset in a development build: use the built-in sample data (and show a banner).
 * Unset or invalid in a production build: fail visibly. A production build never serves sample data.
 */
export type ApiMode =
  | { kind: "http"; baseUrl: string }
  | { kind: "mock" }
  | { kind: "error"; reason: "missing" | "invalid" };

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/;

/** Returns a clean origin (no path, no trailing slash) or null when the value is not acceptable. */
export function normalizeBaseUrl(raw: string, allowInsecureLocal: boolean): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.username || url.password || url.search || url.hash) return null;
  if (url.pathname !== "/" && url.pathname !== "") return null;
  if (url.protocol === "https:") return url.origin;
  // Plain http is only for a local API in development, never for a deployed one.
  if (url.protocol === "http:" && allowInsecureLocal && LOCAL_HOST.test(url.hostname)) return url.origin;
  return null;
}

export function resolveApiConfig(rawBaseUrl: string | undefined, isDevBuild: boolean): ApiMode {
  const value = rawBaseUrl?.trim();
  if (!value) return isDevBuild ? { kind: "mock" } : { kind: "error", reason: "missing" };
  const baseUrl = normalizeBaseUrl(value, isDevBuild);
  return baseUrl ? { kind: "http", baseUrl } : { kind: "error", reason: "invalid" };
}

/** The web app that hosts billing, for the "Manage plan" link on iOS. It follows the API environment. */
export function webAppOrigin(mode: ApiMode): string {
  if (mode.kind === "http") {
    const host = new URL(mode.baseUrl).hostname;
    if (host === "localhost" || host === "127.0.0.1") return "http://localhost:8081";
    if (host.startsWith("api-dev.")) return "https://dev.mergemate.dev";
  }
  return "https://app.mergemate.dev";
}
