import type { Deps } from "../env";
import { ApiError } from "../errors";

export const GITHUB_API = "https://api.github.com";
export const GITHUB_WEB = "https://github.com";
const TIMEOUT_MS = 20_000;
const USER_AGENT = "MergeMate";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const unavailable = (logDetail?: string) =>
  new ApiError("upstream_unavailable", "GitHub is unavailable. Try again.", {}, logDetail);

/**
 * Read-only GitHub REST call with the user's token. GET only: there is no write path.
 * One retry with backoff on 429/5xx. Maps GitHub failures to API error codes.
 */
export const githubGet = async <T>(deps: Deps, token: string, path: string): Promise<T> => {
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await deps.fetch(`${GITHUB_API}${path}`, {
        method: "GET",
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${token}`,
          "user-agent": USER_AGENT,
          "x-github-api-version": "2022-11-28",
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      if (attempt === 0) {
        await sleep(500);
        continue;
      }
      throw unavailable("github api fetch failed");
    }
    if (res.ok) return (await res.json()) as T;
    if ((res.status === 429 || res.status >= 500) && attempt === 0) {
      await sleep(500);
      continue;
    }
    throw await githubError(res);
  }
};

const githubError = async (res: Response) => {
  if (res.status === 401) return new ApiError("unauthorized", "GitHub access expired. Sign in again.");
  if (res.status === 404) return new ApiError("not_found", "Not found on GitHub, or no access.");
  if (res.status === 403) {
    const sso = res.headers.get("x-github-sso");
    const url = sso ? /url=(https:\/\/github\.com\/\S+)/.exec(sso)?.[1] : undefined;
    if (sso) {
      return new ApiError(
        "sso_required",
        "This organization requires single sign-on. Authorize MergeMate for it on GitHub.",
        url ? { "x-sso-url": url } : {},
      );
    }
    if (res.headers.get("x-ratelimit-remaining") === "0") return rateLimited(res);
    const body = await res.text().catch(() => "");
    if (/IP allow list/i.test(body)) {
      return new ApiError("forbidden", "This organization's IP allow list blocks MergeMate.");
    }
    return new ApiError("forbidden", "GitHub denied access.");
  }
  if (res.status === 429) return rateLimited(res);
  return unavailable(`github api status ${res.status}`);
};

const rateLimited = (res: Response) => {
  const reset = Number(res.headers.get("x-ratelimit-reset"));
  const retryAfter = res.headers.get("retry-after") ?? (reset ? String(Math.max(1, reset - Math.floor(Date.now() / 1000))) : "60");
  return new ApiError("upstream_unavailable", "GitHub is rate limiting requests. Try again shortly.", {
    "retry-after": retryAfter,
  });
};

export interface GitHubTokens {
  accessToken: string;
  accessExpiresAt: string | null;
  refreshToken: string | null;
  refreshExpiresAt: string | null;
}

export type TokenExchange = { ok: true; tokens: GitHubTokens } | { ok: false; error: string };

/**
 * POST to GitHub's OAuth token endpoint (code exchange or refresh). Not a repository write.
 * Never logs or returns the response body.
 */
export const requestTokens = async (
  deps: Deps,
  params: Record<string, string>,
): Promise<TokenExchange> => {
  let res: Response;
  try {
    res = await deps.fetch(`${GITHUB_WEB}/login/oauth/access_token`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json", "user-agent": USER_AGENT },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw unavailable("token exchange fetch failed");
  }
  if (res.status === 429) {
    // GitHub throttles repeated token exchanges for one app. Say so, with the wait, instead of "unavailable".
    throw new ApiError(
      "rate_limited",
      "GitHub is limiting sign-in attempts right now. Wait a few minutes, then sign in once.",
      { "retry-after": res.headers.get("retry-after") ?? "300" },
      "token exchange status 429",
    );
  }
  if (res.status >= 500) throw unavailable(`token exchange status ${res.status}`);
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) throw unavailable(`token exchange status ${res.status}, body not JSON (${res.headers.get("content-type") ?? "no type"})`);
  if (typeof body.error === "string") return { ok: false, error: body.error };
  if (typeof body.access_token !== "string" || !body.access_token) throw unavailable(`token exchange status ${res.status}, no access_token`);

  const now = deps.now().getTime();
  const at = (seconds: unknown) =>
    typeof seconds === "number" && seconds > 0 ? new Date(now + seconds * 1000).toISOString() : null;
  return {
    ok: true,
    tokens: {
      accessToken: body.access_token,
      accessExpiresAt: at(body.expires_in),
      refreshToken: typeof body.refresh_token === "string" ? body.refresh_token : null,
      refreshExpiresAt: at(body.refresh_token_expires_in),
    },
  };
};
