import { AiEngineInfo, PrAnswer, ReviewPlan } from "@mergemate/contracts";
import { describe, expect, it } from "vitest";
import { askPr, planReview, storesFor, userKey } from "../src/routes/ai-engine";
import type { PrData } from "../src/routes/ai-engine";
import { onlyPrFiles } from "../src/routes/ai-engine-assist";
import type { SessionRecord } from "../src/lib/sessions";
import { createDbConsentStore } from "../src/routes/consent";
import { ApiError } from "../src/errors";
import type { AiBinding } from "../src/env";
import { mockTransport, validModelEnv } from "./helpers";
import { TestD1 } from "./d1";

const user: SessionRecord = {
  tokenHash: "test-hash",
  userId: "u1",
  demo: false,
  transport: "bearer",
  csrfToken: null,
  expiresAt: "2026-11-26T12:00:00.000Z",
  userStatus: "active",
} as SessionRecord;

const ref = { owner: "o", repo: "r", number: 1 };

const prData = (patch = "run();"): PrData => ({
  title: "t",
  description: "d",
  headSha: "abc",
  files: [
    { path: "src/sync.ts", patch, additions: 2, deletions: 1 },
    { path: "test/sync.test.ts", patch: "it()", additions: 1, deletions: 0 },
  ],
  authorIsBot: false,
  coAuthoredByBot: false,
  hasTests: true,
  checksFailing: false,
});

const grantedDeps = async (transport = mockTransport(async () => ({ text: "{}" }))) => {
  const db = new TestD1() as unknown as D1Database;
  await db
    .prepare(
      `INSERT INTO users (id, github_id, login, name, avatar_url, status, created_at, updated_at)
       VALUES ('u1', 4242, 'user-4242', 'Test User', 'https://example.com/a.png', 'active', '2026-10-26T00:00:00Z', '2026-10-26T00:00:00Z')`,
    )
    .run();
  await createDbConsentStore(db).write("u1", true);
  return {
    db,
    transport,
    ai: undefined as AiBinding | undefined,
    prSource: async () => prData(),
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

const planText = JSON.stringify({
  readingOrder: [
    { file: "src/sync.ts", why: "The retry loop." },
    { file: "etc/invented.ts", why: "Not in the PR." },
    { file: "src/sync.ts", why: "Repeat." },
    { file: "test/sync.test.ts", why: "Covers it." },
  ],
  verify: ["Retry stops after 3."],
  draftComment: "Looks good.",
});

describe("onlyPrFiles", () => {
  it("keeps real files in order, once", () => {
    const kept = onlyPrFiles([{ file: "b" }, { file: "src/sync.ts" }, { file: "src/sync.ts" }], prData());
    expect(kept).toEqual([{ file: "src/sync.ts" }]);
  });
});

describe("planReview", () => {
  it("drops invented files, labels the model, redacts secrets and counts one action", async () => {
    const transport = mockTransport(async () => ({ text: planText }));
    const deps = await grantedDeps(transport);
    const token = `gh${"p_"}${"0".repeat(36)}`;
    deps.prSource = async () => prData(`key = "${token}"`);
    const result = await planReview(deps, user, ref, validModelEnv());
    const plan = ReviewPlan.parse(result.body);
    expect(plan.readingOrder.map((f) => f.file)).toEqual(["src/sync.ts", "test/sync.test.ts"]);
    expect(plan.model).toMatch(/^[a-z-]+:[\w.@/-]+$/);
    expect(plan.coverage.analyzedFiles).toBe(2);
    expect(transport.calls[0]?.request.prompt).not.toContain(token);
    expect(result.remaining).toBe(29);
  });

  it("serves cache hits without calling the model again", async () => {
    const transport = mockTransport(async () => ({ text: planText }));
    const deps = await grantedDeps(transport);
    const first = await planReview(deps, user, ref, validModelEnv());
    const second = await planReview(deps, user, ref, validModelEnv());
    expect(transport.calls).toHaveLength(1);
    expect(second.body).toEqual(first.body);
  });

  it("requires consent and refuses unusable answers without charging", async () => {
    const deps = await grantedDeps(mockTransport(async () => ({ text: "nope" })));
    expect((await apiError(() => planReview(deps, { ...user, userId: "nobody" }, ref, validModelEnv()))).code).toBe("consent_required");
    expect((await apiError(() => planReview(deps, user, ref, validModelEnv()))).code).toBe("upstream_unavailable");
    expect((await storesFor(deps.db).usage.check(userKey(user), 30)).remaining).toBe(30);
  });
});

describe("askPr", () => {
  const answerText = JSON.stringify({
    answer: "It retries three times.",
    citations: [{ file: "src/sync.ts" }, { file: "made/up.ts" }],
  });

  it("answers with citations limited to the PR and sends the question as data", async () => {
    const transport = mockTransport(async () => ({ text: answerText }));
    const deps = await grantedDeps(transport);
    const result = await askPr(deps, user, ref, { question: "What does the retry do?" }, validModelEnv());
    const answer = PrAnswer.parse(result.body);
    expect(answer.citations).toEqual([{ file: "src/sync.ts" }]);
    expect(transport.calls[0]?.request.prompt).toContain("<question>\nWhat does the retry do?\n</question>");
    expect(result.remaining).toBe(29);
  });

  it("charges each question and never caches", async () => {
    const transport = mockTransport(async () => ({ text: answerText }));
    const deps = await grantedDeps(transport);
    await askPr(deps, user, ref, { question: "First question" }, validModelEnv());
    const second = await askPr(deps, user, ref, { question: "First question" }, validModelEnv());
    expect(transport.calls).toHaveLength(2);
    expect(second.remaining).toBe(28);
  });

  it("redacts a pasted token in the question", async () => {
    const transport = mockTransport(async () => ({ text: answerText }));
    const deps = await grantedDeps(transport);
    const token = `gh${"p_"}${"0".repeat(36)}`;
    await askPr(deps, user, ref, { question: `Is ${token} used?` }, validModelEnv());
    expect(transport.calls[0]?.request.prompt).not.toContain(token);
  });

  it("rejects short, long and extra-field questions before any work", async () => {
    const transport = mockTransport(async () => ({ text: answerText }));
    const deps = await grantedDeps(transport);
    for (const body of [{ question: "no" }, { question: "x".repeat(301) }, { question: "fine question", extra: 1 }, undefined]) {
      expect((await apiError(() => askPr(deps, user, ref, body, validModelEnv()))).code).toBe("validation_failed");
    }
    expect(transport.calls).toHaveLength(0);
  });
});

describe("GET /v1/ai/engine", () => {
  it("lists the configured model per job and the profile, without secrets", async () => {
    const { aiEngine } = await import("../src/routes/ai-engine-info");
    const env = { ...validModelEnv(), AI_PROFILE: "hackathon", MODEL_ROUTE_SEGMENT: "meta:sam-3.1", MODEL_API_KEY: "never-shown" };
    const res = await aiEngine.request("/engine", {}, env as never);
    const body = AiEngineInfo.parse(await res.json());
    expect(body.profile).toBe("hackathon");
    expect(body.jobs.find((j) => j.task === "segment")?.model).toBe("meta:sam-3.1");
    expect(body.jobs.find((j) => j.task === "decision")).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("never-shown");
  });
});
