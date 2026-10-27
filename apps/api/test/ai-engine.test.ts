import { describe, expect, it } from "vitest";
import {
  FIXTURE_RISK,
  FIXTURE_SUMMARY,
  FIXTURE_TRIAGE,
  actionLimits,
  analyzeHighlight,
  assessPrRisk,
  assessQuality,
  assessRiskSignals,
  buildDiffContext,
  cacheKey,
  containsTodo,
  createDbCache,
  createDbUsageStore,
  createFetchTransport,
  maxLevel,
  redactSecrets,
  scanPatch,
  scoreTriageLane,
  secondsToMidnight,
  storesFor,
  stripCodeFences,
  summarizePr,
  toPrData,
  userKey,
} from "../src/routes/ai-engine";
import type { PrData } from "../src/routes/ai-engine";
import type { PrDetail } from "@mergemate/contracts";
import type { SessionRecord } from "../src/lib/sessions";
import { createDbConsentStore, parseConsentUpdate, requireConsent } from "../src/routes/consent";
import { ApiError } from "../src/errors";
import { mockTransport, validModelEnv } from "./helpers";
import { TestD1 } from "./d1";

const testDb = () => new TestD1() as unknown as D1Database;

const seedUser = async (db: D1Database, id: string, githubId: number) => {
  await db
    .prepare(
      `INSERT INTO users (id, github_id, login, name, avatar_url, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'active', '2026-10-26T00:00:00Z', '2026-10-26T00:00:00Z')`,
    )
    .bind(id, githubId, `user-${githubId}`, "Test User", "https://example.com/a.png")
    .run();
};

/** Assembled at runtime so the secret scan stays clean. None of these are real. */
const fakeToken = () => `gh${"p_"}${"0".repeat(36)}`;
const fakeAwsKey = () => `${"AK"}${"IA"}${"0".repeat(16)}`;
const fakeKeyBlock = () => `${"-----BEGIN "}${"PRIVATE KEY-----"}`;
const fakeAssignment = () => `api_key = "${"k".repeat(20)}"`;

const record = (overrides: Partial<SessionRecord> = {}): SessionRecord => ({
  tokenHash: "test-hash",
  userId: "u1",
  demo: false,
  transport: "bearer",
  csrfToken: null,
  expiresAt: "2026-11-26T12:00:00.000Z",
  userStatus: "active",
  ...overrides,
});

const user = record();
const demo = record({ userId: null, demo: true });

const prData = (patch: string): PrData => ({
  title: "t",
  description: "d",
  headSha: "abc",
  files: [{ path: "src/sync.ts", patch, additions: 2, deletions: 1 }],
  authorIsBot: false,
  coAuthoredByBot: false,
  hasTests: true,
  checksFailing: false,
});

const grantedDeps = async (transport = mockTransport(async () => ({ text: "{}" }))) => {
  const db = testDb();
  await seedUser(db, "u1", 4242);
  await createDbConsentStore(db).write("u1", true);
  return {
    db,
    transport,
    prSource: async () => prData("run();"),
    limits: { free: 30, pro: 500, global: undefined as number | undefined },
  };
};

const apiError = async (run: () => Promise<unknown>): Promise<ApiError> => {
  try {
    await run();
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error("expected an ApiError");
};

describe("userKey", () => {
  it("keys demo sessions without a user id", () => {
    expect(userKey(user)).toBe("u1");
    expect(userKey(demo)).toBe("demo");
  });
});

describe("redactSecrets", () => {
  it("redacts credential matches and leaves clean text alone", () => {
    const token = fakeToken();
    const result = redactSecrets(`key ${token} end`);
    expect(result.redacted).toBe(true);
    expect(result.text).toBe("key [REDACTED] end");
    expect(redactSecrets("nothing here").redacted).toBe(false);
  });

  it("covers the full pattern set", () => {
    const text = [fakeAwsKey(), fakeKeyBlock(), fakeAssignment()].join("\n");
    const result = redactSecrets(text);
    expect(result.redacted).toBe(true);
    expect(result.text).not.toContain("AKIA");
    expect(result.text).not.toContain("PRIVATE");
  });
});

describe("scanPatch", () => {
  it("reports file and line without the value", () => {
    const token = fakeToken();
    const findings = scanPatch("config/stripe.ts", `first\nkey = "${token}"\nlast`);
    expect(findings).toEqual([{ file: "config/stripe.ts", line: 2, rule: "github-token" }]);
    expect(JSON.stringify(findings)).not.toContain(token);
  });
});

describe("buildDiffContext", () => {
  it("skips lockfiles and reports coverage", () => {
    const { context, coverage } = buildDiffContext({
      title: "t",
      description: "d",
      files: [
        { path: "src/a.ts", patch: "x" },
        { path: "package-lock.json", patch: "y" },
      ],
    });
    expect(context).toContain("src/a.ts");
    expect(context).not.toContain("package-lock");
    expect(coverage).toEqual({ analyzedFiles: 1, skippedFiles: 1, truncatedFiles: 0 });
  });

  it("truncates oversized patches with a marker", () => {
    const { context, coverage } = buildDiffContext({
      title: "t",
      description: "d",
      files: [{ path: "src/big.ts", patch: `z${"z".repeat(9000)}` }],
    });
    expect(context).toContain("…[truncated]");
    expect(coverage.truncatedFiles).toBe(1);
  });

  it("caps considered files at 300", () => {
    const files = Array.from({ length: 301 }, (_, i) => ({ path: `src/f${i}.ts`, patch: "x" }));
    const { coverage } = buildDiffContext({ title: "t", description: "d", files });
    expect(coverage.analyzedFiles).toBe(300);
    expect(coverage.skippedFiles).toBe(1);
  });
});

describe("assessRiskSignals", () => {
  const base = { files: ["src/a.ts"], totalChanged: 10, secretFindings: [], hasTests: true as const, checksFailing: false as const };
  it("raises secrets and failing checks to high", () => {
    expect(
      assessRiskSignals({ ...base, secretFindings: [{ file: "a", line: 1, rule: "r" }] }).level,
    ).toBe("high");
    expect(assessRiskSignals({ ...base, checksFailing: true }).level).toBe("high");
  });

  it("raises sensitive paths, missing tests and large diffs to medium", () => {
    expect(assessRiskSignals({ ...base, files: ["src/auth/session.ts"] }).level).toBe("medium");
    expect(assessRiskSignals({ ...base, hasTests: false }).level).toBe("medium");
    expect(assessRiskSignals({ ...base, totalChanged: 1200 }).level).toBe("medium");
  });

  it("stays low and explains a clean change", () => {
    expect(assessRiskSignals(base)).toEqual({
      level: "low",
      reasons: ["No risk signals: small change with tests and passing checks."],
    });
  });
});

describe("assessQuality and scoreTriageLane", () => {
  const clean = {
    authorIsBot: false,
    coAuthoredByBot: false,
    hasTests: true as const,
    hasTodo: false,
    checksFailing: false as const,
    filesOutsideScope: false,
    totalChanged: 10,
    classifierScore: null,
  };
  it("flags agent-authored and sloppy PRs", () => {
    const quality = assessQuality({ ...clean, authorIsBot: true, hasTests: false });
    expect(quality.needsCloserLook).toBe(true);
    expect(quality.reasons).toContain("Authored with a coding agent.");
    expect(scoreTriageLane(quality).lane).toBe("needs_you");
  });

  it("counts a high classifier score and ignores a low one", () => {
    expect(assessQuality({ ...clean, classifierScore: 0.9 }).needsCloserLook).toBe(true);
    expect(assessQuality({ ...clean, classifierScore: 0.2 }).needsCloserLook).toBe(false);
  });

  it("parks clean PRs in fyi", () => {
    expect(scoreTriageLane(assessQuality(clean))).toEqual({ lane: "fyi", reason: "No risk signals." });
  });
});

describe("D1 usage store", () => {
  it("enforces the daily cap and persists across instances", async () => {
    const db = testDb();
    const first = createDbUsageStore(db);
    for (let i = 0; i < 30; i += 1) await first.count("u1");
    expect(await first.check("u1", 30)).toEqual({ limited: true, limit: 30, remaining: 0 });
    const second = createDbUsageStore(db);
    expect(await second.check("u1", 30)).toEqual({ limited: true, limit: 30, remaining: 0 });
  });
});

describe("D1 result cache", () => {
  it("scopes entries by user and persists across instances", async () => {
    const db = testDb();
    await seedUser(db, "u1", 4242);
    await seedUser(db, "u2", 4343);
    const first = createDbCache(db);
    expect(await first.get(cacheKey("u1", "o/r#1", "abc", "summary"))).toBeUndefined();
    await first.set(cacheKey("u1", "o/r#1", "abc", "summary"), "u1", { ok: true });
    const second = createDbCache(db);
    expect(await second.get(cacheKey("u1", "o/r#1", "abc", "summary"))).toEqual({ ok: true });
    expect(await second.get(cacheKey("u2", "o/r#1", "abc", "summary"))).toBeUndefined();
    expect(await second.get(cacheKey("u1", "o/r#1", "abc", "risk"))).toBeUndefined();
  });
});

describe("D1 consent store", () => {
  it("persists grants across instances", async () => {
    const db = testDb();
    await seedUser(db, "u1", 4242);
    const first = createDbConsentStore(db);
    expect((await first.read("u1")).granted).toBe(false);
    await first.write("u1", true);
    const second = createDbConsentStore(db);
    expect(await second.read("u1")).toMatchObject({ granted: true, version: "1" });
  });
});

describe("summarizePr", () => {
  const summaryText = JSON.stringify({
    whatChanged: "x",
    whyItMatters: "y",
    suggestedFocus: ["src/sync.ts"],
  });

  it("redacts secrets before the model call and uses computed coverage", async () => {
    const token = fakeToken();
    const transport = mockTransport(async () => ({ text: summaryText }));
    const deps = await grantedDeps(transport);
    deps.prSource = async () => prData(`key = "${token}"`);
    const result = await summarizePr(deps, user, { owner: "o", repo: "r", number: 1 }, validModelEnv());
    expect(result.body.coverage).toEqual({ analyzedFiles: 1, skippedFiles: 0, truncatedFiles: 0 });
    expect(transport.calls).toHaveLength(1);
    expect(transport.calls[0]?.request.prompt).toContain("[REDACTED]");
    expect(transport.calls[0]?.request.prompt).not.toContain(token);
    expect(result.remaining).toBe(29);
  });

  it("serves cache hits without calling the model or counting", async () => {
    const transport = mockTransport(async () => ({ text: summaryText }));
    const deps = await grantedDeps(transport);
    const first = await summarizePr(deps, user, { owner: "o", repo: "r", number: 1 }, validModelEnv());
    const second = await summarizePr(deps, user, { owner: "o", repo: "r", number: 1 }, validModelEnv());
    expect(transport.calls).toHaveLength(1);
    expect(second.body).toEqual(first.body);
    expect(second.remaining).toBe(first.remaining);
  });

  it("requires consent first", async () => {
    const deps = await grantedDeps();
    const err = await apiError(() =>
      summarizePr(deps, record({ userId: "nobody" }), { owner: "o", repo: "r", number: 1 }, validModelEnv()),
    );
    expect(err.code).toBe("consent_required");
  });

  it("returns rate_limited with retry-after at the cap", async () => {
    const deps = await grantedDeps();
    const stores = storesFor(deps.db);
    for (let i = 0; i < 30; i += 1) await stores.usage.count("u1");
    const err = await apiError(() =>
      summarizePr(deps, user, { owner: "o", repo: "r", number: 1 }, validModelEnv()),
    );
    expect(err.code).toBe("rate_limited");
    expect(err.headers["retry-after"]).toMatch(/^\d+$/);
  });

  it("rejects unusable model output without counting it", async () => {
    const transport = mockTransport(async () => ({ text: "not json" }));
    const deps = await grantedDeps(transport);
    const err = await apiError(() =>
      summarizePr(deps, user, { owner: "o", repo: "r", number: 1 }, validModelEnv()),
    );
    expect(err.code).toBe("upstream_unavailable");
    expect((await storesFor(deps.db).usage.check("u1", 30)).remaining).toBe(30);
  });

  it("surfaces misconfiguration instead of substituting", async () => {
    const deps = await grantedDeps(mockTransport(async () => ({ text: summaryText })));
    const err = await apiError(() =>
      summarizePr(deps, user, { owner: "o", repo: "r", number: 1 }, { ...validModelEnv(), MODEL_ID: "  " }),
    );
    expect(err.code).toBe("misconfigured");
  });
});

describe("assessPrRisk", () => {
  const riskText = JSON.stringify({ level: "low", reasons: ["model reason"] });

  it("floors the level on secrets and attaches findings plus quality", async () => {
    const token = fakeToken();
    const transport = mockTransport(async () => ({ text: riskText }));
    const deps = await grantedDeps(transport);
    deps.prSource = async () => ({
      ...prData(`key = "${token}"`),
      authorIsBot: true,
      hasTests: false,
    });
    const result = await assessPrRisk(deps, user, { owner: "o", repo: "r", number: 1 }, validModelEnv());
    const body = result.body;
    if (!("level" in body)) throw new Error("expected a risk body");
    expect(body.level).toBe("high");
    expect(body.secretFindings).toEqual([{ file: "src/sync.ts", line: 1, rule: "github-token" }]);
    expect(body.quality?.needsCloserLook).toBe(true);
    expect(JSON.stringify(body)).not.toContain(token);
  });
});

describe("toPrData", () => {
  const detail = (overrides: Partial<PrDetail> = {}): PrDetail => ({
    repo: "acme/api",
    number: 7,
    title: "Add cache",
    body: "Faster reads.",
    author: "octocat",
    status: "open",
    baseBranch: "main",
    headBranch: "feat/cache",
    headSha: "abc123",
    additions: 12,
    deletions: 3,
    changedFiles: 2,
    files: [
      { path: "src/cache.ts", status: "added", additions: 10, deletions: 0, patch: "+cache" },
      { path: "test/cache.test.ts", status: "added", additions: 2, deletions: 0, patch: "+test" },
    ],
    checks: [{ name: "ci", state: "success" }],
    threads: [],
    createdAt: "2026-10-26T10:00:00Z",
    updatedAt: "2026-10-26T11:00:00Z",
    htmlUrl: "https://github.com/acme/api/pull/7",
    ...overrides,
  });

  it("maps detail onto pipeline signals", () => {
    const data = toPrData(detail(), []);
    expect(data).toMatchObject({
      title: "Add cache",
      headSha: "abc123",
      authorIsBot: false,
      coAuthoredByBot: false,
      hasTests: true,
      checksFailing: false,
    });
  });

  it("detects bot authors, trailers and failing checks", () => {
    const data = toPrData(
      detail({
        author: "dependabot[bot]",
        checks: [{ name: "ci", state: "failure" }],
        files: [{ path: "src/a.ts", status: "modified", additions: 2000, deletions: 0, patch: "x" }],
      }),
      [{ author: null, commit: { message: "Fix\n\nCo-authored-by: Helper <bot@example.com>" } }],
    );
    expect(data.authorIsBot).toBe(true);
    expect(data.hasTests).toBe(false);
    expect(data.checksFailing).toBe(true);
  });

  it("spots co-author trailers from coding agents", () => {
    const data = toPrData(detail(), [
      { author: { login: "octocat" }, commit: { message: "Work\n\nCo-authored-by: Dev [bot] <1@users>" } },
    ]);
    expect(data.coAuthoredByBot).toBe(true);
  });
});

describe("plan-aware caps", () => {
  it("gives pro users the pro cap and free users the free cap", async () => {
    const db = testDb();
    await seedUser(db, "u1", 4242);
    await seedUser(db, "u2", 4343);
    await createDbConsentStore(db).write("u1", true);
    await createDbConsentStore(db).write("u2", true);
    await db
      .prepare("INSERT INTO billing_accounts (user_id, plan, updated_at) VALUES (?, 'pro', '2026-10-26T00:00:00Z')")
      .bind("u2")
      .run();
    const transport = mockTransport(async () => ({ text: JSON.stringify({ whatChanged: "x", whyItMatters: "y", suggestedFocus: [] }) }));
    const base = { db, transport, prSource: async () => prData("run();"), limits: { free: 30, pro: 500 } };
    const pro = await summarizePr(base, record({ userId: "u2" }), { owner: "o", repo: "r", number: 1 }, validModelEnv());
    expect(pro.limit).toBe(500);
    expect(pro.remaining).toBe(499);
    const free = await summarizePr(base, record({ userId: "u1" }), { owner: "o", repo: "r", number: 1 }, validModelEnv());
    expect(free.limit).toBe(30);
  });
});

describe("misc engine helpers", () => {
  it("parses limits with safe defaults", () => {
    expect(actionLimits({})).toEqual({ free: 30, pro: 500, global: undefined });
  });

  it("reads configured limits and ignores invalid globals", () => {
    expect(
      actionLimits({ AI_DAILY_ACTIONS_FREE: "10", AI_GLOBAL_DAILY_ACTIONS: "100" }).free,
    ).toBe(10);
    expect(actionLimits({ AI_GLOBAL_DAILY_ACTIONS: "nope" }).global).toBeUndefined();
  });

  it("strips code fences, detects todos and ranks levels", () => {
    expect(stripCodeFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(stripCodeFences("plain")).toBe("plain");
    expect(containsTodo("fix TODO later")).toBe(true);
    expect(containsTodo("clean")).toBe(false);
    expect(maxLevel("low", "high", "medium")).toBe("high");
    expect(secondsToMidnight()).toBeGreaterThan(0);
  });

  it("leaves highlight unavailable without a vision transport", async () => {
    await expect(analyzeHighlight()).rejects.toMatchObject({ code: "upstream_unavailable" });
  });

  it("keeps fixtures shape-valid", () => {
    expect(FIXTURE_SUMMARY.coverage.analyzedFiles).toBe(1);
    expect(FIXTURE_RISK.level).toBe("low");
    expect(FIXTURE_TRIAGE).toHaveLength(2);
  });
});

describe("consent helpers", () => {
  it("parses updates and rejects stale versions", () => {
    expect(parseConsentUpdate({ ai: { granted: true, version: "1" } })).toEqual({ granted: true });
    expect(() => parseConsentUpdate({ ai: { granted: true, version: "0" } })).toThrowError(
      expect.objectContaining({ code: "validation_failed" }),
    );
    expect(() => parseConsentUpdate({})).toThrowError(
      expect.objectContaining({ code: "validation_failed" }),
    );
  });

  it("gates on the current grant", async () => {
    const db = testDb();
    await seedUser(db, "u1", 4242);
    const store = createDbConsentStore(db);
    await expect(requireConsent(store, "u1")).rejects.toMatchObject({ code: "consent_required" });
    await store.write("u1", true);
    await expect(requireConsent(store, "u1")).resolves.toBeUndefined();
  });
});

describe("createFetchTransport", () => {
  const stubFetch = (statuses: number[]) => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fn = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const status = statuses[Math.min(calls.length - 1, statuses.length - 1)] ?? 200;
      return new Response(JSON.stringify({ choices: [{ message: { content: "hi" } }] }), { status });
    }) as unknown as typeof fetch;
    return { fn, calls };
  };

  it("posts chat completions with the key and retries once on 429", async () => {
    const { fn, calls } = stubFetch([429, 200]);
    const transport = createFetchTransport(fn);
    const result = await transport.complete({
      config: { provider: "meta", modelId: "muse-spark-1.2", baseUrl: "https://api.meta.ai/v1" },
      apiKey: "k",
      request: { system: "s", prompt: "p", maxOutputTokens: 10 },
    });
    expect(result).toEqual({ text: "hi" });
    expect(calls).toHaveLength(2);
    expect(calls[0]?.url).toBe("https://api.meta.ai/v1/chat/completions");
    expect((calls[0]?.init.headers as Record<string, string>).authorization).toBe("Bearer k");
  });

  it("gives up after the retry and on client errors", async () => {
    await expect(
      createFetchTransport(stubFetch([500, 500]).fn).complete({
        config: { provider: "meta", modelId: "m", baseUrl: "https://x" },
        apiKey: "k",
        request: { system: "s", prompt: "p", maxOutputTokens: 1 },
      }),
    ).rejects.toThrow();
    const stub = stubFetch([400]);
    await expect(
      createFetchTransport(stub.fn).complete({
        config: { provider: "meta", modelId: "m", baseUrl: "https://x" },
        apiKey: "k",
        request: { system: "s", prompt: "p", maxOutputTokens: 1 },
      }),
    ).rejects.toThrow();
    expect(stub.calls).toHaveLength(1);
  });
});
