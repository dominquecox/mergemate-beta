const ACCESS_HEADERS = ["cf-access-client-id", "cf-access-client-secret", "cf-access-jwt-assertion"];

function cleanHeaders(input: Headers): Headers {
  const out = new Headers(input);
  for (const name of ACCESS_HEADERS) out.delete(name);
  const cookie = out.get("cookie");
  if (cookie) {
    const kept = cookie.split(";").map((part) => part.trim()).filter((part) => !/^cf_authorization=/i.test(part));
    if (kept.length) out.set("cookie", kept.join("; ")); else out.delete("cookie");
  }
  return out;
}

function rewriteCookie(value: string): string {
  const strippedDomain = value.replace(/;\s*Domain=[^;]*/gi, "");
  // RFC 6265bis: __Host- prefixed cookies MUST have Path=/ and no Domain. Rewriting Path drops them in browsers.
  if (/^__Host-/i.test(strippedDomain.trim())) return strippedDomain;
  return strippedDomain.replace(/;\s*Path=([^;]*)/gi, (_m, path: string) => `; Path=/__api${path.trim().startsWith("/") ? path.trim() : `/${path.trim()}`}`);
}

const PINNED_ORIGIN = "https://api-dev.mergemate.dev";

/** Returns the safe upstream path (with query) or null if the request tries to leave the pinned origin. */
function upstreamPath(pathname: string, search: string): string | null {
  const raw = pathname.slice("/__api".length) || "/";
  let decoded = raw;
  for (let i = 0; i < 3; i++) {
    try { const next = decodeURIComponent(decoded); if (next === decoded) break; decoded = next; } catch { return null; }
  }
  if (!raw.startsWith("/") || raw.startsWith("//") || /\\|\/\//.test(decoded) || decoded.includes("\\") || /^[a-z][a-z0-9+.-]*:/i.test(decoded.replace(/^\/+/, "")) || [...decoded].some((ch) => ch.charCodeAt(0) < 32)) return null;
  const url = new URL(raw + search, PINNED_ORIGIN);
  return url.origin === PINNED_ORIGIN ? url.pathname + url.search : null;
}

export async function devApiProxy(request: Request, env: { DEV_API_PROXY?: string; DEV_API?: Fetcher; CF_ACCESS_CLIENT_ID?: string; CF_ACCESS_CLIENT_SECRET?: string }): Promise<Response> {
  if (env.DEV_API_PROXY !== "1") return new Response("Not found", { status: 404 });
  const incoming = new URL(request.url);
  const path = upstreamPath(incoming.pathname, incoming.search);
  if (path === null) return Response.json({ error: { code: "bad_proxy_path" } }, { status: 400 });
  const target = new URL(path, PINNED_ORIGIN);
  if (target.origin !== PINNED_ORIGIN) return Response.json({ error: { code: "bad_proxy_path" } }, { status: 400 });
  const headers = cleanHeaders(request.headers);
  let response: Response;
  if (env.DEV_API) {
    response = await env.DEV_API.fetch(new Request(target, { method: request.method, headers, body: request.body, redirect: "manual" }));
  } else if (env.CF_ACCESS_CLIENT_ID && env.CF_ACCESS_CLIENT_SECRET && target.origin === PINNED_ORIGIN) {
    headers.set("CF-Access-Client-Id", env.CF_ACCESS_CLIENT_ID);
    headers.set("CF-Access-Client-Secret", env.CF_ACCESS_CLIENT_SECRET);
    response = await fetch(new Request(target, { method: request.method, headers, body: request.body, redirect: "manual" }));
  } else return Response.json({ error: { code: "proxy_not_configured" } }, { status: 503 });
  if (response.status === 101) return response;
  const output = new Headers(response.headers);
  for (const name of [...output.keys()]) if (name.toLowerCase().startsWith("access-control-")) output.delete(name);
  const cookies = (output as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  if (cookies.length) {
    output.delete("set-cookie");
    for (const cookie of cookies) output.append("set-cookie", rewriteCookie(cookie));
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: output });
}
