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
  return value.replace(/;\s*Domain=[^;]*/gi, "").replace(/;\s*Path=([^;]*)/gi, (_m, path: string) => `; Path=/__api${path.trim().startsWith("/") ? path.trim() : `/${path.trim()}`}`);
}

export async function devApiProxy(request: Request, env: { DEV_API_PROXY?: string; DEV_API?: Fetcher; CF_ACCESS_CLIENT_ID?: string; CF_ACCESS_CLIENT_SECRET?: string }): Promise<Response> {
  if (env.DEV_API_PROXY !== "1") return new Response("Not found", { status: 404 });
  const incoming = new URL(request.url);
  const target = new URL((incoming.pathname.slice("/__api".length) || "/") + incoming.search, "https://api-dev.mergemate.dev");
  const headers = cleanHeaders(request.headers);
  let response: Response;
  if (env.DEV_API) {
    response = await env.DEV_API.fetch(new Request(target, { method: request.method, headers, body: request.body, redirect: "manual" }));
  } else if (env.CF_ACCESS_CLIENT_ID && env.CF_ACCESS_CLIENT_SECRET) {
    headers.set("CF-Access-Client-Id", env.CF_ACCESS_CLIENT_ID);
    headers.set("CF-Access-Client-Secret", env.CF_ACCESS_CLIENT_SECRET);
    response = await fetch(new Request(target, { method: request.method, headers, body: request.body, redirect: "manual" }));
  } else return Response.json({ error: { code: "proxy_not_configured" } }, { status: 503 });
  const output = new Headers(response.headers);
  for (const name of [...output.keys()]) if (name.toLowerCase().startsWith("access-control-")) output.delete(name);
  const cookies = (output as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  if (cookies.length) {
    output.delete("set-cookie");
    for (const cookie of cookies) output.append("set-cookie", rewriteCookie(cookie));
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: output });
}
