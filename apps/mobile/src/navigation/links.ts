const origins = new Set(["https://app.mergemate.dev", "https://dev.mergemate.dev"]);
const value = (input: unknown): input is string => typeof input === "string" && input.length > 0 && input.length <= 1024 && ![...input].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
export function validOAuthParams(params: {code?: unknown; state?: unknown; error?: unknown}): boolean {
  if (params.error !== undefined) return value(params.error) && params.code === undefined && (params.state===undefined || value(params.state));
  return value(params.code) && value(params.state);
}

/** HTTPS associations and the exact registered browser-session return route. PKCE still authorizes exchange. */
export function isVerifiedCallbackUrl(raw: string): boolean {
  if(raw.length>4096)return false;
  try {
    const url = new URL(raw);
    const registeredScheme=url.protocol==='mergemate:' && url.hostname==='auth' && !url.port && url.pathname==='/callback';
    if ((!registeredScheme && (!origins.has(url.origin) || url.pathname!=="/auth/callback")) || url.username || url.password || url.hash) return false;
    if(url.searchParams.has('native') && url.searchParams.get('native')!=='1')return false;
    const keys = [...url.searchParams.keys()];
    const allowed=url.searchParams.has("error")?["error","state","error_description","error_uri","native"]:["code","state","native"];
    if (keys.some(key => !allowed.includes(key)) || keys.length !== new Set(keys).size) return false;
    return validOAuthParams(Object.fromEntries(url.searchParams));
  } catch { return false; }
}

/** Cold and warm native launches share this strict route adapter. */
export function nativeLinkPath(raw: string): string {
  if(raw.length>4096)return "/(auth)/sign-in";
  try {
    const url = new URL(raw);
    if (isVerifiedCallbackUrl(raw)) return "/auth/callback" + url.search;
    if (!origins.has(url.origin) || url.username || url.password || url.hash) return "/(auth)/sign-in";
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
