import { describe, it, expect } from "vitest";
import { ApiClientError, messageForCode, toUserMessage } from "../src/api/errors";
import { NOW, errorResponse, jsonResponse, makeClient } from "./helpers";

const RAW = "Server said: <script>alert(1)</script> at /srv/app/routes/x.ts:12";

describe("error code mapping", () => {
  const cases: [string, number, RegExp][] = [
    ["unauthorized", 401, /session has ended/i],
    ["upstream_unavailable", 502, /couldn't reach GitHub or the AI service/i],
    ["misconfigured", 500, /isn't set up correctly/i],
    ["internal", 500, /something went wrong/i],
    ["sso_required", 403, /single sign-on/i],
    ["rate_limited", 429, /limit/i],
  ];

  it.each(cases)("maps %s to plain language and never shows the server's text", async (code, status, pattern) => {
    const { client } = makeClient(() => errorResponse(code, status, RAW), { platform: "native", token: "tok_aaaaaaaaaaaaaaaaaaaaaa" });
    const failure = await client.getNotifications().catch((e) => e);
    expect(failure).toBeInstanceOf(ApiClientError);
    expect(failure.code).toBe(code);
    expect(failure.message).toMatch(pattern);
    expect(failure.message).not.toContain("script");
    expect(failure.message).not.toContain(".ts");
    expect(failure.requestId).toBe("req_test");
  });

  it("uses the API's own short sentence for validation, forbidden and consent errors", async () => {
    for (const [code, status, text] of [
      ["validation_failed", 422, "That image type is not supported."],
      ["forbidden", 403, "Not available in the demo."],
      ["consent_required", 403, "AI features need your consent first."],
    ] as const) {
      const { client } = makeClient(() => errorResponse(code, status, text), { platform: "native", token: "tok_aaaaaaaaaaaaaaaaaaaaaa" });
      await expect(client.getNotifications()).rejects.toMatchObject({ code, message: text });
    }
  });

  it("falls back to fixed copy when the API's sentence looks unsafe", () => {
    expect(messageForCode("validation_failed", { serverMessage: "<b>oops</b>" })).toBe(
      "That request wasn't valid. Check it and try again.",
    );
    expect(messageForCode("forbidden", { serverMessage: "x".repeat(500) })).toBe("That isn't available for this account.");
    expect(messageForCode("not_found", { serverMessage: "line1\nline2" })).toBe("We couldn't find that.");
  });

  it("reads retry-after for rate limits and says how long to wait", async () => {
    const { client } = makeClient(() => errorResponse("rate_limited", 429, RAW, { "retry-after": "300" }));
    const failure = await client.getNotifications().catch((e) => e);
    expect(failure.code).toBe("rate_limited");
    expect(failure.retryAfterSeconds).toBe(300);
    expect(failure.message).toBe("You've reached a limit for now. Try again in 5 minutes.");
  });

  it("formats short and long waits", () => {
    expect(messageForCode("rate_limited", { retryAfterSeconds: 20 })).toContain("a minute");
    expect(messageForCode("rate_limited", { retryAfterSeconds: 7200 })).toContain("2 hours");
    expect(messageForCode("rate_limited")).toContain("a little while");
  });

  it("keeps only a GitHub single sign-on link from the x-sso-url header", async () => {
    const good = makeClient(() => errorResponse("sso_required", 403, RAW, { "x-sso-url": "https://github.com/orgs/acme/sso?authorization_request=abc" }));
    await expect(good.client.getRepos()).rejects.toMatchObject({
      code: "sso_required",
      ssoUrl: "https://github.com/orgs/acme/sso?authorization_request=abc",
    });
    const bad = makeClient(() => errorResponse("sso_required", 403, RAW, { "x-sso-url": "https://evil.example.com/sso" }));
    const failure = await bad.client.getRepos().catch((e) => e);
    expect(failure.code).toBe("sso_required");
    expect(failure.ssoUrl).toBeUndefined();
  });

  it("maps a non-JSON error body by status without showing the body", async () => {
    const { client } = makeClient(() => new Response("<html>Bad gateway at proxy-7</html>", { status: 502 }));
    const failure = await client.getRepos().catch((e) => e);
    expect(failure.code).toBe("upstream_unavailable");
    expect(failure.message).not.toContain("proxy-7");
  });

  it("maps a network failure to an offline message", async () => {
    const { client } = makeClient(() => {
      throw new TypeError("Failed to fetch");
    });
    const failure = await client.getRepos().catch((e) => e);
    expect(failure.code).toBe("network");
    expect(failure.message).toMatch(/offline/i);
  });

  it("maps a stalled request to a timeout", async () => {
    const { client } = makeClient(
      (req) =>
        new Promise<Response>((_resolve, reject) => {
          req.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
      { timeoutMs: 20 },
    );
    const failure = await client.getRepos().catch((e) => e);
    expect(failure.code).toBe("timeout");
    expect(failure.message).toMatch(/too long/i);
  });

  it("toUserMessage never leaks unknown errors", () => {
    expect(toUserMessage(new Error("TypeError: x is undefined at foo.ts:3"))).not.toContain("foo.ts");
    expect(toUserMessage("weird", "Fallback.")).toBe("Fallback.");
    expect(toUserMessage(new ApiClientError("network", "Offline."))).toBe("Offline.");
  });
});

describe("response validation", () => {
  it("turns a response that does not match the contract into an error state, not raw data", async () => {
    const { client } = makeClient(() => jsonResponse({ items: [{ id: 7, secret: "do-not-show" }], nextCursor: null }));
    const failure = await client.getNotifications().catch((e) => e);
    expect(failure).toBeInstanceOf(ApiClientError);
    expect(failure.code).toBe("parse_failed");
    expect(failure.message).not.toContain("do-not-show");
    expect(failure.message).not.toContain("secret");
  });

  it("treats a 200 with a non-JSON body as a parse failure", async () => {
    const { client } = makeClient(() => new Response("<html>hello</html>", { status: 200 }));
    await expect(client.getMe()).rejects.toMatchObject({ code: "parse_failed" });
  });

  it("rejects an authorize URL that is not GitHub", async () => {
    const { client } = makeClient(() => jsonResponse({ authorizeUrl: "https://evil.example.com/login", state: "s" }));
    await expect(client.startGithubAuth("web", "c".repeat(43))).rejects.toMatchObject({ code: "parse_failed" });
  });

  it("accepts the GitHub authorize URL the API returns", async () => {
    const url = "https://github.com/login/oauth/authorize?client_id=x&state=s";
    const { client, calls } = makeClient(() => jsonResponse({ authorizeUrl: url, state: "s" }));
    await expect(client.startGithubAuth("web", "c".repeat(43))).resolves.toEqual({ authorizeUrl: url, state: "s" });
    expect(calls[0]?.body).toEqual({ codeChallenge: "c".repeat(43), platform: "web" });
  });

  it("shows the PR without AI, with a plain reason, when a summary does not parse", async () => {
    const { client } = makeClient(
      (req) => {
        if (req.path.endsWith("/summary")) return jsonResponse({ nonsense: true });
        if (req.path.endsWith("/risk")) return jsonResponse({ nonsense: true });
        return jsonResponse(PR);
      },
      { platform: "native", token: "tok_aaaaaaaaaaaaaaaaaaaaaa" },
    );
    const detail = await client.getPrDetail("octo", "repo", 7);
    expect(detail.title).toBe("Add login");
    expect(detail.summary).toBeUndefined();
    expect(detail.risk).toBeUndefined();
    expect(detail.aiNotice?.code).toBe("parse_failed");
    expect(detail.aiNotice?.message).not.toContain("nonsense");
  });
});

const PR = {
  repo: "octo/repo",
  number: 7,
  title: "Add login",
  body: "",
  author: "octo",
  status: "open",
  baseBranch: "main",
  headBranch: "feat/login",
  headSha: "abc123",
  additions: 3,
  deletions: 1,
  changedFiles: 1,
  files: [{ path: "src/a.ts", status: "modified", additions: 3, deletions: 1 }],
  checks: [{ name: "ci", state: "success" }],
  threads: [],
  createdAt: NOW,
  updatedAt: NOW,
  htmlUrl: "https://github.com/octo/repo/pull/7",
};
