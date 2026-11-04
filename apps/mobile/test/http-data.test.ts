import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { NOW, USER, errorResponse, jsonResponse, makeClient, type Handler } from "./helpers";

const TOKEN = "tok_aaaaaaaaaaaaaaaaaaaaaa";
const native = (handler: Handler) => makeClient(handler, { platform: "native", token: TOKEN });

const PR = {
  repo: "octo/repo",
  number: 7,
  title: "Add login",
  body: "Adds login.",
  author: "octo",
  status: "open",
  baseBranch: "main",
  headBranch: "feat/login",
  headSha: "abc123",
  additions: 30,
  deletions: 4,
  changedFiles: 2,
  files: [
    { path: "src/auth.ts", status: "added", additions: 20, deletions: 0, patch: "@@ -0,0 +1 @@\n+x" },
    { path: "src/old.ts", status: "renamed", additions: 10, deletions: 4 },
  ],
  checks: [
    { name: "ci", state: "success" },
    { name: "lint", state: "in_progress" },
    { name: "e2e", state: "failure" },
  ],
  threads: [
    { id: "conversation", path: null, line: null, comments: [{ id: "1", author: "reviewer", body: "Looks good", createdAt: NOW }] },
  ],
  createdAt: NOW,
  updatedAt: NOW,
  htmlUrl: "https://github.com/octo/repo/pull/7",
};
const SUMMARY = {
  whatChanged: "Adds login.",
  whyItMatters: "Users can sign in.",
  suggestedFocus: ["Session handling"],
  coverage: { analyzedFiles: 2, skippedFiles: 0, truncatedFiles: 0 },
};
const RISK = {
  level: "high",
  reasons: ["Touches auth"],
  coverage: { analyzedFiles: 2, skippedFiles: 0, truncatedFiles: 0 },
  secretFindings: [
    { file: "config/stripe.ts", line: 4, rule: "stripe-key" },
    { file: "config/other.ts", line: 9, rule: "generic" },
  ],
};

describe("pull request detail", () => {
  it("loads triage metadata with one read and no AI request", async () => {
    const {client,calls}=native(()=>jsonResponse(PR));
    const detail=await client.getPrMetadata("octo","repo",7);
    expect(calls.map(call=>`${call.method} ${call.path}`)).toEqual(["GET /prs/octo/repo/7?lazy=1"]);
    expect(detail).toMatchObject({author:"octo",additions:30,deletions:4,changedFilesCount:2});
    expect(detail.checks.map(check=>check.conclusion)).toEqual(["success","pending","failure"]);
    expect(detail.summary).toBeUndefined();
    expect(detail.risk).toBeUndefined();
  });

  it("opens the PR and adds summary, risk and a secret warning without the secret value", async () => {
    const { client, calls } = native((req) => {
      if (req.path.endsWith("/summary")) return jsonResponse(SUMMARY);
      if (req.path.endsWith("/risk")) return jsonResponse(RISK);
      return jsonResponse(PR);
    });
    const d = await client.getPrDetail("octo", "repo", 7);
    expect(calls.map((c) => `${c.method} ${c.path}`).sort()).toEqual([
      "GET /prs/octo/repo/7?lazy=1",
      "POST /prs/octo/repo/7/risk",
      "POST /prs/octo/repo/7/summary",
    ]);
    expect(d.owner).toBe("octo");
    expect(d.repo).toBe("repo");
    expect(d.changedFilesCount).toBe(2);
    expect(d.summary?.whatChanged).toBe("Adds login.");
    expect(d.risk?.level).toBe("high");
    expect(d.aiNotice).toBeUndefined();
    expect(d.secretWarning).toMatchObject({ file: "config/stripe.ts", line: 4, rule: "stripe-key" });
    expect(d.secretWarning?.maskedSnippet).toContain("value hidden");
    expect(d.secretWarning?.maskedSnippet).toContain("+1 more");
    expect(d.files.map((f) => f.status)).toEqual(["added", "renamed"]);
    expect(d.checks.map((c) => c.conclusion)).toEqual(["success", "pending", "failure"]);
    expect(d.comments).toHaveLength(1);
    expect(d.comments[0]?.author).toBe("reviewer");
    expect(d.htmlUrl).toBe("https://github.com/octo/repo/pull/7");
  });

  it('shares ten PR opens including AI requests and reuses the recent detail',async()=>{
    const {client,calls}=native(req=>req.path.endsWith('/summary')?jsonResponse(SUMMARY):req.path.endsWith('/risk')?jsonResponse(RISK):jsonResponse(PR));
    const details=await Promise.all(Array.from({length:10},()=>client.getPrDetail('octo','repo',7)));
    expect(details).toHaveLength(10);expect(calls).toHaveLength(3);
    await client.getPrDetail('octo','repo',7);expect(calls).toHaveLength(3);
  });

  it("drops a PR link that is not on GitHub", async () => {
    const { client } = native((req) => {
      if (req.method === "POST") return errorResponse("consent_required", 403, "AI features need your consent first.");
      return jsonResponse({ ...PR, htmlUrl: "https://evil.example.com/pull/7" });
    });
    expect((await client.getPrDetail("octo", "repo", 7)).htmlUrl).toBe("");
  });

  it("explains missing AI with a plain reason for each cause", async () => {
    const causes: [string, number, string][] = [
      ["consent_required", 403, "consent_required"],
      ["rate_limited", 429, "rate_limited"],
      ["upstream_unavailable", 502, "upstream_unavailable"],
    ];
    for (const [code, status, expected] of causes) {
      const { client } = native((req) => (req.method === "POST" ? errorResponse(code, status, "raw <b>body</b>") : jsonResponse(PR)));
      const d = await client.getPrDetail("octo", "repo", 7);
      expect(d.title).toBe("Add login");
      expect(d.summary).toBeUndefined();
      expect(d.aiNotice?.code).toBe(expected);
      expect(d.aiNotice?.message).not.toContain("raw");
    }
  });

  it("fails the whole screen when the session is gone", async () => {
    const { client } = native((req) => (req.method === "POST" ? errorResponse("unauthorized", 401) : jsonResponse(PR)));
    await expect(client.getPrDetail("octo", "repo", 7)).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("surfaces a PR that cannot be read", async () => {
    const { client } = native(() => errorResponse("not_found", 404, "Not found."));
    await expect(client.getPrDetail("octo", "repo", 7)).rejects.toMatchObject({ code: "not_found" });
  });

  it("rejects a bad PR number before any request", async () => {
    const { client, calls } = native(() => jsonResponse(PR));
    await expect(client.getPrDetail("octo", "repo", Number.NaN)).rejects.toMatchObject({ code: "validation_failed" });
    expect(calls).toHaveLength(0);
  });

  it("sends the CSRF token on the AI calls on web", async () => {
    const { client, calls } = makeClient((req) => {
      if (req.path === "/auth/csrf") return jsonResponse({ csrfToken: "csrf_token_aaaaaaaaaaaaaaaaaaaa" });
      if (req.path.endsWith("/summary")) return jsonResponse(SUMMARY);
      if (req.path.endsWith("/risk")) return jsonResponse(RISK);
      return jsonResponse(PR);
    });
    await client.getPrDetail("octo", "repo", 7);
    const posts = calls.filter((c) => c.method === "POST");
    expect(posts).toHaveLength(2);
    expect(posts.every((p) => p.headers["x-csrf-token"] === "csrf_token_aaaaaaaaaaaaaaaaaaaa")).toBe(true);
    expect(calls.filter((c) => c.path === "/auth/csrf")).toHaveLength(1);
  });
});

describe("inbox, triage, consent and settings", () => {
  it("reads notification pages with the filter and cursor", async () => {
    const item = (n: number) => ({
      id: `n_abcdefgh${n}`,
      kind: "review",
      repo: "octo/repo",
      number: n,
      title: `PR ${n}`,
      author: "octo",
      status: "open",
      updatedAt: NOW,
      read: false,
    });
    const { client, calls } = native((req) =>
      req.url.includes("cursor=") ? jsonResponse({ items: [item(2)], nextCursor: null }) : jsonResponse({ items: [item(1)], nextCursor: "next page+1" }),
    );
    const first = await client.getNotificationPage("review");
    expect(calls).toHaveLength(1);
    const second = await client.getNotificationPage("review",first.nextCursor);
    expect([...first.items,...second.items].map(i=>i.number)).toEqual([1,2]);
    expect(calls[0]?.path).toBe("/notifications?filter=review");
    expect(calls[1]?.path).toBe("/notifications?filter=review&cursor=next%20page%2B1");
  });

  it("marks done, snoozes and restores with the opaque id encoded", async () => {
    const { client, calls } = native(() => new Response(null, { status: 204 }));
    await client.markNotificationDone("a/b c");
    await client.snoozeNotification("a/b c", NOW);
    await client.restoreNotification("a/b c");
    expect(calls.map((c) => c.path)).toEqual([
      "/notifications/a%2Fb%20c/done",
      "/notifications/a%2Fb%20c/snooze",
      "/notifications/a%2Fb%20c/restore",
    ]);
    expect(calls[1]?.body).toEqual({ until: NOW });
  });

  it("gets the triage queue and posts a choice with the PR reference URL-encoded", async () => {
    const queue = [{ prRef: "octo/repo#7", lane: "needs_you", reason: "Asked for your review", title: "Add login" }];
    const { client, calls } = native((req) =>
      req.method === "GET" ? jsonResponse(queue) : jsonResponse({ prRef: "octo/repo#7", lane: "fyi" }),
    );
    await expect(client.getTriageQueue()).resolves.toEqual(queue);
    await client.setTriageChoice("octo/repo#7", "fyi");
    expect(calls[1]?.url).toContain("/v1/triage/octo%2Frepo%237");
    expect(calls[1]?.body).toEqual({ lane: "fyi" });
  });

  it("reads and writes AI consent with the app's consent version", async () => {
    const { client, calls } = native((req) =>
      jsonResponse({ ai: { granted: req.method === "PUT", version: "1", ...(req.method === "PUT" ? { at: NOW } : {}) } }),
    );
    await expect(client.getConsent()).resolves.toEqual({ ai: { granted: false, version: "1" } });
    await client.setConsent(true);
    expect(calls[1]?.method).toBe("PUT");
    expect(calls[1]?.body).toEqual({ ai: { granted: true, version: "1" } });
  });

  it("sends the full settings object when one setting changes", async () => {
    const stored = {
      notifications: { review: true, mention: true, mine: true },
      quietHours: null,
      aiSummaries: true,
    };
    const { client, calls } = native((req) => (req.method === "PUT" ? jsonResponse(req.body) : jsonResponse(stored)));
    const updated = await client.updateSettings({ notifications: { review: false, mention: true, mine: true } });
    expect(calls[0]?.method).toBe("GET");
    expect(calls[1]?.body).toEqual({
      notifications: { review: false, mention: true, mine: true },
      quietHours: null,
      aiSummaries: true,
    });
    expect(updated.notifications.review).toBe(false);

    await client.updateSettings({ quietHours: { start: "22:00", end: "08:00", timeZone: "Europe/Berlin" } });
    expect(calls[2]?.body).toMatchObject({
      notifications: { review: false },
      quietHours: { start: "22:00", end: "08:00", timeZone: "Europe/Berlin" },
    });
  });
});

describe("repositories and installations", () => {
  it("loads picker data through the authenticated shared client and validates both contracts", async () => {
    const { client, calls } = native((request) => request.path.endsWith("/pulls")
      ? jsonResponse({ items: [{ number: 7, title: "Fix cache", author: "octo", status: "open" }] })
      : jsonResponse({ defaultBranch: "main", items: [{ name: "main", isDefault: true }] }));
    const pulls = await client.getRepoPulls("octo", "review app");
    const branches = await client.getRepoBranches("octo", "review app");
    expect(pulls.items[0]).toMatchObject({ number: 7, author: "octo" });
    expect(branches).toEqual({ defaultBranch: "main", items: [{ name: "main", isDefault: true }] });
    expect(calls.map((call) => call.path)).toEqual([
      "/repos/octo/review%20app/pulls",
      "/repos/octo/review%20app/branches",
    ]);
    expect(calls.every((call) => call.headers.authorization === `Bearer ${TOKEN}`)).toBe(true);
  });

  it("rejects malformed picker responses instead of passing raw GitHub-shaped data to hooks", async () => {
    const { client } = native(() => jsonResponse([{ number: 7, title: "raw response" }]));
    await expect(client.getRepoPulls("octo", "repo")).rejects.toMatchObject({ code: "parse_failed" });
  });

  it("follows repo pages and keeps whether a repo is private when watch is toggled", async () => {
    const repo = (id: string, priv: boolean) => ({ id, fullName: `octo/r${id}`, private: priv, watching: true });
    const { client, calls } = native((req) => {
      if (req.method === "PUT") return jsonResponse({ id: "2", fullName: "octo/r2", watching: false });
      return req.url.includes("cursor=")
        ? jsonResponse({ items: [repo("2", true)], nextCursor: null })
        : jsonResponse({ items: [repo("1", false)], nextCursor: "c1" });
    });
    const first = await client.getRepoPage();
    expect(calls).toHaveLength(1);
    const second = await client.getRepoPage(first.nextCursor);
    expect([...first.items,...second.items].map(r=>r.id)).toEqual(['1','2']);
    const toggled = await client.toggleWatchRepo("2", false);
    expect(toggled).toEqual({ id: "2", fullName: "octo/r2", private: true, watching: false });
    expect(calls[2]?.path).toBe("/repos/2/watch");
    expect(calls[2]?.body).toEqual({ watching: false });
  });

  it("maps installations, including suspended, with GitHub-only links", async () => {
    const { client } = native(() =>
      jsonResponse({
        items: [
          { id: "1", account: "octo", accountType: "User", status: "active", manageUrl: "https://github.com/settings/installations/1" },
          { id: "2", account: "acme", accountType: "Organization", status: "suspended", manageUrl: "https://evil.example.com/x" },
        ],
        installUrl: "https://github.com/apps/mergemate/installations/new",
      }),
    );
    const res = await client.getOrgInstallations();
    expect(res.installUrl).toBe("https://github.com/apps/mergemate/installations/new");
    expect(res.items[0]).toMatchObject({ id: "1", org: "octo", status: "active", manageUrl: "https://github.com/settings/installations/1" });
    expect(res.items[1]).toMatchObject({ org: "acme", status: "suspended" });
    expect(res.items[1]?.manageUrl).toBeUndefined();
  });
});

describe("highlight, billing and public content", () => {
  it("uploads the screenshot as multipart on native without setting the content type", async () => {
    const { client, calls } = native(() => jsonResponse({ insight: "Looks fine.", requestId: "req_1" }));
    const res = await client.analyzeHighlight("file:///tmp/shot.jpg", "  check padding  ", "image/jpeg");
    expect(res).toEqual({ insight: "Looks fine.", regions: [], requestId: "req_1" });
    expect(calls[0]?.path).toBe("/highlight");
    expect(calls[0]?.rawBody).toBeInstanceOf(FormData);
    expect(calls[0]?.headers["content-type"]).toBeUndefined();
    expect((calls[0]?.rawBody as FormData).get("note")).toBe("check padding");
  });

  it("uploads the picked image as a blob on web, with the CSRF header", async () => {
    const { client, calls } = makeClient((req) => {
      if (req.url.startsWith("blob:")) return new Response(new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" }));
      if (req.path === "/auth/csrf") return jsonResponse({ csrfToken: "csrf_token_aaaaaaaaaaaaaaaaaaaa" });
      return jsonResponse({ insight: "Looks fine.", requestId: "req_1" });
    });
    await client.analyzeHighlight("blob:http://localhost:8081/abc");
    const upload = calls.find((c) => c.path === "/highlight");
    expect(upload?.headers["x-csrf-token"]).toBe("csrf_token_aaaaaaaaaaaaaaaaaaaa");
    expect((upload?.rawBody as FormData).get("image")).toBeInstanceOf(Blob);
  });

  it("maps highlighted regions from the 0 to 1000 scale", async () => {
    const { client } = native(() =>
      jsonResponse({
        insight: "The button is off center.",
        regions: [{ xMin: 100, yMin: 200, xMax: 400, yMax: 260, label: "Checkout button" }],
        requestId: "req_2",
      }),
    );
    const res = await client.analyzeHighlight("file:///tmp/shot.png", undefined, "image/png");
    expect(res.regions).toEqual([
      { id: "region-0", x: 100, y: 200, width: 300, height: 60, label: "Checkout button", comment: "" },
    ]);
  });

  it("maps the billing plan", async () => {
    const { client } = native(() => jsonResponse({ plan: "free", status: "none", renewsAt: null, cancelAt: null, trialEligible: true, canManage: false }));
    await expect(client.getBillingPlan()).resolves.toEqual({ plan: "free", status: "none", trialEligible: true, canManage: false });
  });

  it("lists public posts without a session and maps them to the news and changelog cards", async () => {
    const { client, calls } = makeClient((req) =>
      jsonResponse({
        items: [{ slug: "hello", type: "news", title: "Hello", excerpt: "First post.", publishedAt: NOW }],
        nextCursor: null,
      }),
    );
    const posts = await client.getPublicPosts("news");
    expect(calls[0]?.path).toBe("/public/posts?type=news");
    expect(posts).toEqual([
      { slug: "hello", type: "news", title: "Hello", date: "2026-10-27", summary: "First post.", content: "First post." },
    ]);
  });

  it("sends a support message with the bot-check token, and explains when there is none", async () => {
    const withCheck = makeClient(() => jsonResponse({ received: true }, 202), { getTurnstileToken: async () => "ts_ok" });
    await withCheck.client.sendSupportMessage(" me@example.com ", "Hello");
    expect(withCheck.calls[0]?.body).toEqual({ email: "me@example.com", message: "Hello", turnstileToken: "ts_ok" });

    const without = makeClient(() => jsonResponse({ received: true }, 202));
    await expect(without.client.sendSupportMessage("me@example.com", "Hello")).rejects.toMatchObject({
      code: "bot_check_unavailable",
    });
    expect(without.calls).toHaveLength(0);
  });

  it("support form source validates email address before submission", () => {
    const supportSource = fs.readFileSync(path.resolve(__dirname, "../app/(public)/support.tsx"), "utf8");
    expect(supportSource).toContain("Please enter a valid email address.");
  });

  it("reads health without a session", async () => {
    const { client, calls } = native(() => jsonResponse({ ok: true, version: "1.2.3" }));
    await expect(client.health()).resolves.toEqual({ ok: true, version: "1.2.3" });
    expect(calls[0]?.headers.authorization).toBeUndefined();
  });

  it("reads the signed-in user", async () => {
    const { client } = native(() => jsonResponse(USER));
    await expect(client.getMe()).resolves.toEqual(USER);
  });
});
