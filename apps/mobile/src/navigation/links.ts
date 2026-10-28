const origins = new Set(["https://app.mergemate.dev", "https://dev.mergemate.dev"]);
const value = (input: unknown): input is string => typeof input === "string" && input.length > 0 && input.length <= 1024 && ![...input].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
export function validOAuthParams(params: {code?: unknown; state?: unknown; error?: unknown}): boolean {
  if (params.error !== undefined) return value(params.error) && params.code === undefined && params.state === undefined;
  return value(params.code) && value(params.state);
}

/** Only HTTPS on approved hosts may deliver authorization codes to native. */
export function isVerifiedCallbackUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (!origins.has(url.origin) || url.username || url.password || url.hash || url.pathname !== "/auth/callback") return false;
    const keys = [...url.searchParams.keys()];
    if (keys.some(key => !["code", "state", "error"].includes(key)) || keys.length !== new Set(keys).size) return false;
    return validOAuthParams(Object.fromEntries(url.searchParams));
  } catch { return false; }
}

/** Cold and warm native launches share this strict route adapter. */
export function nativeLinkPath(raw: string): string {
  try {
    const url = new URL(raw);
    if (!origins.has(url.origin) || url.username || url.password || url.hash) return "/(auth)/sign-in";
    if (isVerifiedCallbackUrl(raw)) return url.pathname + url.search;
    if (url.search || url.pathname.includes("%")) return "/(auth)/sign-in";
    if (/^\/pr\/[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_][A-Za-z0-9_.-]{0,99}\/[1-9][0-9]{0,9}$/.test(url.pathname)) return url.pathname;
    if (["/", "/inbox", "/notifications", "/triage", "/settings"].includes(url.pathname)) return url.pathname;
  } catch { /* Untrusted system paths must not crash routing. */ }
  return "/(auth)/sign-in";
}

export function validGitHubAuthorizeUrl(raw: string, state: string, challenge: string): boolean {
  try {
    const url = new URL(raw);
    return url.origin === "https://github.com" && !url.username && !url.password && !url.hash && url.pathname === "/login/oauth/authorize"
      && url.searchParams.getAll("state").length === 1 && url.searchParams.get("state") === state
      && url.searchParams.getAll("code_challenge").length === 1 && url.searchParams.get("code_challenge") === challenge
      && url.searchParams.get("code_challenge_method") === "S256";
  } catch { return false; }
}
