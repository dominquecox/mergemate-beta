import { ErrorBody, PrDetail, RepoPage } from "@mergemate/contracts";
import { describe, expect, it } from "vitest";
import { json, testContext } from "./helpers";
import { appFor, post, signIn, tokenResponse } from "./sign-in";

const GH = "https://api.github.com";

const installations = {
  installations: [
    { id: 11, account: { login: "octo-dev", type: "User" }, suspended_at: null, html_url: "https://github.com/settings/installations/11" },
    { id: 22, account: { login: "acme", type: "Organization" }, suspended_at: null, html_url: "https://github.com/organizations/acme/settings/installations/22" },
    { id: 33, account: { login: "old-org", type: "Organization" }, suspended_at: "2026-10-01T00:00:00Z", html_url: "https://github.com/organizations/old-org/settings/installations/33" },
  ],
};

const repos = (start: number, n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: start + i, full_name: `org/repo-${start + i}`, private: i % 2 === 0 }));

describe("GET /v1/me/installations", () => {
  it("lists installations with status and the install link", async () => {
    const ctx = testContext();
    const { headers } = await signIn(ctx);
    ctx.net.on("GET", `${GH}/user/installations`, installations);
    const res = await appFor(ctx)("/v1/me/installations", { headers });
    const body = (await res.json()) as { items: { account: string; status: string }[]; installUrl: string };
    expect(body.items.map((i) => [i.account, i.status])).toEqual([
      ["octo-dev", "active"],
      ["acme", "active"],
      ["old-org", "suspended"],
    ]);
    expect(body.installUrl).toBe("https://github.com/apps/mergemate-test/installations/new");
    const call = ctx.net.calls.at(-1);
    expect(call?.headers.get("authorization")).toBe(`Bearer ${tokenResponse().access_token}`);
  });
});

describe("GET /v1/repos", () => {
  it("pages through every active installation with watch state", async () => {
    const ctx = testContext();
    const { headers, userId } = await signIn(ctx);
    ctx.net
      .on("GET", `${GH}/user/installations`, installations)
      .on("GET", `${GH}/user/installations/11/repositories?per_page=50&page=1`, { total_count: 60, repositories: repos(1, 50) })
      .on("GET", `${GH}/user/installations/11/repositories?per_page=50&page=2`, { total_count: 60, repositories: repos(51, 10) })
      .on("GET", `${GH}/user/installations/22/repositories?per_page=50&page=1`, { total_count: 1, repositories: repos(900, 1) });
    ctx.db.sqlite
      .prepare("INSERT INTO repo_watch (user_id, repo_id, full_name, watching, updated_at) VALUES (?, '2', 'org/repo-2', 0, 'x')")
      .run(userId);

    const call = appFor(ctx);
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const res = await call(`/v1/repos${cursor ? `?cursor=${cursor}` : ""}`, { headers });
      const page = RepoPage.parse(await res.json());
      seen.push(...page.items.map((r) => r.id));
      if (pages === 0) expect(page.items.find((r) => r.id === "2")?.watching).toBe(false);
      cursor = page.nextCursor;
      pages++;
    } while (cursor && pages < 10);
    expect(pages).toBe(3);
    expect(seen).toHaveLength(61);
    expect(seen.at(-1)).toBe("900");
  });

  it("rejects a forged cursor", async () => {
    const ctx = testContext();
    const { headers } = await signIn(ctx);
    expect((await appFor(ctx)("/v1/repos?cursor=%%%", { headers })).status).toBe(422);
  });
});

describe("PUT /v1/repos/:id/watch", () => {
  it("stores the choice only after GitHub confirms the user can see the repo", async () => {
    const ctx = testContext();
    const { headers, userId } = await signIn(ctx);
    ctx.net.on("GET", `${GH}/repositories/77`, { id: 77, full_name: "acme/api" });
    const res = await appFor(ctx)("/v1/repos/77/watch", { method: "PUT", headers, body: JSON.stringify({ watching: false }) });
    expect(res.status).toBe(200);
    expect(ctx.db.rows("SELECT user_id, repo_id, full_name, watching FROM repo_watch")).toEqual([
      { user_id: userId, repo_id: "77", full_name: "acme/api", watching: 0 },
    ]);
  });

  it("stores nothing for a repo the user cannot see", async () => {
    const ctx = testContext();
    const { headers } = await signIn(ctx);
    ctx.net.on("GET", `${GH}/repositories/78`, () => json({ message: "Not Found" }, 404));
    const res = await appFor(ctx)("/v1/repos/78/watch", { method: "PUT", headers, body: JSON.stringify({ watching: true }) });
    expect(res.status).toBe(404);
    expect(ctx.db.rows("SELECT * FROM repo_watch")).toHaveLength(0);
  });
});

describe("GET /v1/prs/:owner/:repo/:number", () => {
  const pull = {
    number: 7,
    title: "Add cache",
    body: null,
    state: "open",
    draft: false,
    merged_at: null,
    user: { login: "octo-dev" },
    base: { ref: "main" },
    head: { ref: "feat/cache", sha: "abc123" },
    additions: 10,
    deletions: 2,
    changed_files: 2,
    created_at: "2026-10-26T10:00:00Z",
    updated_at: "2026-10-26T11:00:00Z",
    html_url: "https://github.com/acme/api/pull/7",
  };

  const mockPr = (ctx: ReturnType<typeof testContext>) =>
    ctx.net
      .on("GET", `${GH}/repos/acme/api/pulls/7?`, pull)
      .on("GET", `${GH}/repos/acme/api/pulls/7`, pull)
      .on("GET", `${GH}/repos/acme/api/pulls/7/files`, [
        { filename: "src/cache.ts", status: "added", additions: 8, deletions: 0, patch: "@@ +1 @@" },
        { filename: "logo.png", status: "modified", additions: 0, deletions: 0 },
      ])
      .on("GET", `${GH}/repos/acme/api/commits/abc123/check-runs`, {
        check_runs: [
          { name: "build", status: "completed", conclusion: "success", html_url: "https://github.com/acme/api/runs/1" },
          { name: "test", status: "completed", conclusion: "timed_out", html_url: null },
          { name: "lint", status: "in_progress", conclusion: null, html_url: null },
        ],
      })
      .on("GET", `${GH}/repos/acme/api/commits/abc123/status`, {
        statuses: [{ context: "deploy/preview", state: "pending", target_url: "javascript:alert(1)" }],
      })
      .on("GET", `${GH}/repos/acme/api/pulls/7/comments`, [
        { id: 1, user: { login: "rev" }, body: "Why?", created_at: "2026-10-26T10:30:00Z", path: "src/cache.ts", line: 3 },
        { id: 2, user: { login: "octo-dev" }, body: "Speed.", created_at: "2026-10-26T10:40:00Z", path: "src/cache.ts", line: 3, in_reply_to_id: 1 },
      ])
      .on("GET", `${GH}/repos/acme/api/issues/7/comments`, [
        { id: 9, user: { login: "rev" }, body: "LGTM overall", created_at: "2026-10-26T10:50:00Z" },
      ]);

  it("returns header data, files, checks and threads using the user's own token", async () => {
    const ctx = testContext();
    const { headers } = await signIn(ctx);
    mockPr(ctx);
    const res = await appFor(ctx)("/v1/prs/acme/api/7", { headers });
    expect(res.status).toBe(200);
    const pr = PrDetail.parse(await res.json());
    expect(pr).toMatchObject({ repo: "acme/api", status: "open", body: "", headSha: "abc123", changedFiles: 2 });
    expect(pr.files[0]).toMatchObject({ path: "src/cache.ts", patch: "@@ +1 @@" });
    expect(pr.files[1]?.patch).toBeUndefined();
    expect(pr.checks).toEqual([
      { name: "build", state: "success", url: "https://github.com/acme/api/runs/1" },
      { name: "test", state: "failure" },
      { name: "lint", state: "in_progress" },
      { name: "deploy/preview", state: "queued" },
    ]);
    expect(pr.threads.map((t) => [t.id, t.path, t.comments.length])).toEqual([
      ["conversation", null, 1],
      ["1", "src/cache.ts", 2],
    ]);
    const tokens = ctx.net.calls.filter((c) => c.url.startsWith(`${GH}/repos/`)).map((c) => c.headers.get("authorization"));
    expect(new Set(tokens)).toEqual(new Set([`Bearer ${tokenResponse().access_token}`]));
  });

  it("rejects invalid references before calling GitHub", async () => {
    const ctx = testContext();
    const { headers } = await signIn(ctx);
    const before = ctx.net.calls.length;
    expect((await appFor(ctx)("/v1/prs/acme/a%20b/7", { headers })).status).toBe(422);
    expect((await appFor(ctx)("/v1/prs/acme/api/0", { headers })).status).toBe(422);
    expect(ctx.net.calls.length).toBe(before);
  });

  it("returns sso_required with GitHub's authorization URL", async () => {
    const ctx = testContext();
    const { headers } = await signIn(ctx);
    ctx.net.on("GET", `${GH}/repos/acme/api/pulls/7`, () =>
      json({ message: "SSO" }, 403, { "x-github-sso": "required; url=https://github.com/orgs/acme/sso?authorization_request=abc" }),
    );
    const res = await appFor(ctx)("/v1/prs/acme/api/7", { headers });
    expect(res.status).toBe(403);
    expect(ErrorBody.parse(await res.json()).error.code).toBe("sso_required");
    expect(res.headers.get("x-sso-url")).toBe("https://github.com/orgs/acme/sso?authorization_request=abc");
  });

  it("explains an IP allow list block", async () => {
    const ctx = testContext();
    const { headers } = await signIn(ctx);
    ctx.net.on("GET", `${GH}/repos/acme/api/pulls/7`, () =>
      json({ message: "Although you appear to have the correct authorization credentials, the `acme` organization has an IP allow list enabled" }, 403),
    );
    const res = await appFor(ctx)("/v1/prs/acme/api/7", { headers });
    expect(ErrorBody.parse(await res.json()).error.message).toMatch(/IP allow list/);
  });

  it("maps GitHub outages to upstream_unavailable after one retry", async () => {
    const ctx = testContext();
    const { headers } = await signIn(ctx);
    ctx.net.on("GET", `${GH}/repos/acme/api/pulls/7`, () => json({}, 502));
    const res = await appFor(ctx)("/v1/prs/acme/api/7", { headers });
    expect(res.status).toBe(502);
    expect(ctx.net.calls.filter((c) => c.url.endsWith("/pulls/7"))).toHaveLength(2);
  });
});

describe("GitHub token refresh", () => {
  it("refreshes an expiring token once, even for parallel requests", async () => {
    const ctx = testContext();
    const { headers } = await signIn(ctx);
    ctx.time.advance(8 * 60 * 60 * 1000); // access token now expired
    ctx.net
      .on("POST", "https://github.com/login/oauth/access_token", () => json(tokenResponse(2)))
      .on("GET", `${GH}/user/installations`, installations);
    const call = appFor(ctx);
    const results = await Promise.all([1, 2, 3].map(() => call("/v1/me/installations", { headers })));
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    const refreshes = ctx.net.calls.filter(
      (c) => c.url === "https://github.com/login/oauth/access_token" && JSON.parse(c.body ?? "{}").grant_type === "refresh_token",
    );
    expect(refreshes).toHaveLength(1);
    expect(JSON.parse(refreshes[0]?.body ?? "{}").refresh_token).toBe(tokenResponse(1).refresh_token);
    const used = ctx.net.calls.filter((c) => c.url.startsWith(`${GH}/user/installations`)).map((c) => c.headers.get("authorization"));
    expect(new Set(used)).toEqual(new Set([`Bearer ${tokenResponse(2).access_token}`]));
  });

  it("asks the user to sign in again when GitHub rejects the refresh token", async () => {
    const ctx = testContext();
    const { headers } = await signIn(ctx);
    ctx.time.advance(8 * 60 * 60 * 1000);
    ctx.net.on("POST", "https://github.com/login/oauth/access_token", { error: "bad_refresh_token" });
    const res = await appFor(ctx)("/v1/me/installations", { headers });
    expect(res.status).toBe(401);
  });
});

describe("DELETE /v1/account", () => {
  it("revokes the GitHub grant, then deletes every row for the user", async () => {
    const ctx = testContext();
    const { headers, userId } = await signIn(ctx);
    const other = await signIn(ctx, "ios", { id: 9, login: "other", name: null, avatar_url: "https://avatars.githubusercontent.com/u/9" });
    ctx.db.sqlite
      .prepare("INSERT INTO notification_state (user_id, item_id, done_at, updated_at) VALUES (?, 'abcdefgh', 'x', 'x')")
      .run(userId);
    ctx.net.on("DELETE", `${GH}/applications/Iv-test-client/grant`, () => new Response(null, { status: 204 }));

    const res = await appFor(ctx)("/v1/account", { method: "DELETE", headers });
    expect(res.status).toBe(204);
    const revoke = ctx.net.calls.find((c) => c.method === "DELETE");
    expect(revoke?.headers.get("authorization")).toBe(`Basic ${btoa("Iv-test-client:test-secret-not-real")}`);
    expect(JSON.parse(revoke?.body ?? "{}")).toEqual({ access_token: tokenResponse().access_token });
    for (const table of ["users", "sessions", "github_tokens", "notification_state"]) {
      expect(ctx.db.rows(`SELECT * FROM ${table} WHERE ${table === "users" ? "id" : "user_id"} = ?`, userId), table).toHaveLength(0);
    }
    expect((await appFor(ctx)("/v1/me", { headers })).status).toBe(401);
    expect((await appFor(ctx)("/v1/me", { headers: other.headers })).status).toBe(200);
  });

  it("keeps the account when GitHub cannot revoke, so the user can retry", async () => {
    const ctx = testContext();
    const { headers } = await signIn(ctx);
    ctx.net.on("DELETE", `${GH}/applications/Iv-test-client/grant`, () => new Response(null, { status: 500 }));
    const res = await appFor(ctx)("/v1/account", { method: "DELETE", headers });
    expect(res.status).toBe(502);
    expect(ctx.db.rows("SELECT * FROM users")).toHaveLength(1);
  });

  it("needs the CSRF token on web", async () => {
    const ctx = testContext();
    const { headers } = await signIn(ctx, "web");
    expect((await appFor(ctx)("/v1/account", { method: "DELETE", headers })).status).toBe(403);
  });
});

describe("telemetry", () => {
  it("records allowlisted events keyed by user id only", async () => {
    const ctx = testContext();
    const { headers, userId } = await signIn(ctx);
    const res = await appFor(ctx)("/v1/events", post({ name: "inbox_view", props: { filter: "all" } }, headers));
    expect(res.status).toBe(204);
    expect(ctx.points).toEqual([{ indexes: [userId], blobs: ["event", "inbox_view", '{"filter":"all"}'] }]);
  });

  it("rejects unknown events and oversized payloads", async () => {
    const ctx = testContext();
    const { headers } = await signIn(ctx);
    const call = appFor(ctx);
    expect((await call("/v1/events", post({ name: "keylogger" }, headers))).status).toBe(422);
    const big = post({ message: "x".repeat(5000), platform: "ios", appVersion: "1" }, headers);
    expect((await call("/v1/telemetry/error", big)).status).toBe(413);
    expect(ctx.points).toHaveLength(0);
  });

  it("requires a session", async () => {
    const res = await appFor(testContext())("/v1/events", post({ name: "app_open" }));
    expect(res.status).toBe(401);
  });
});

describe("merge state", () => {
  it("maps GitHub mergeability and never calls an uncomputed state ready", async () => {
    const { mergeStateOf } = await import("../src/routes/github");
    const open = { state: "open" as const, merged_at: null };
    expect(mergeStateOf({ ...open, mergeable: false, mergeable_state: "dirty" })).toBe("conflicts");
    expect(mergeStateOf({ ...open, mergeable: null, mergeable_state: "unknown" })).toBe("unknown");
    expect(mergeStateOf({ ...open, mergeable: true, mergeable_state: "clean" })).toBe("clean");
    expect(mergeStateOf({ ...open, mergeable: true, mergeable_state: "behind" })).toBe("behind");
    expect(mergeStateOf({ ...open, mergeable: true, mergeable_state: "blocked" })).toBe("blocked");
    expect(mergeStateOf({ ...open, mergeable: true, mergeable_state: "unstable" })).toBe("unstable");
    expect(mergeStateOf({ state: "closed", merged_at: "2026-10-27T00:00:00Z", mergeable: null })).toBeUndefined();
  });
});

describe("token exchange rate limit", () => {
  it("reports GitHub's 429 on sign-in as rate_limited with a wait, not as unavailable", async () => {
    const { requestTokens } = await import("../src/lib/github");
    const deps = {
      fetch: (async () => new Response("", { status: 429, headers: { "retry-after": "120" } })) as unknown as typeof fetch,
      now: () => new Date("2026-10-27T00:00:00Z"),
    } as unknown as Parameters<typeof requestTokens>[0];
    await expect(requestTokens(deps, { code: "c" })).rejects.toMatchObject({
      code: "rate_limited",
      headers: { "retry-after": "120" },
      logDetail: "token exchange status 429",
    });
  });
});
