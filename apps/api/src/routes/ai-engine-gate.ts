import { requireBinding } from "../config";
import { captureAiPolicy, type AiPolicyFence } from "../lib/ai-policy";
import { PrRisk, PrSummary } from "@mergemate/contracts";
import type { MiddlewareHandler } from "hono";
import { recordAiCall } from "../ai/metrics";
import type { AiOutcome } from "../ai/metrics";
import type { CompletionRequest, CompletionResult, ModelProvider, ModelTransport } from "../ai/provider";
import type { AiTask } from "../ai/routes";
import { userModelContext } from "../lib/user-meta-key";
import type { SessionRecord } from "../lib/sessions";
import { getBillingPlan } from "../lib/stripe-billing";
import type { ConsentStore } from "./consent";
import { createDbConsentStore, requireConsent } from "./consent";
import type { AiBinding, AppEnv, Env } from "../env";
import { ApiError } from "../errors";
import { stripCodeFences } from "./ai-engine-model";
import { PrDataSource } from "./ai-engine-pr-data";

/** Storage key for per-user AI state. Demo sessions share one key but only read fixtures. */
export const userKey = (session: SessionRecord): string => session.userId ?? "demo";

/** Authenticated responses are never cached. */
export const noStore: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next();
  c.res.headers.set("Cache-Control", "no-store");
};

export interface AiActionLimits {
  free: number;
  pro: number;
  /** Global daily action budget. Absent when unconfigured, and then unenforced. */
  global?: number | undefined;
}

export const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
};

/** Action caps from Worker config. Every user gets the free cap until billing assigns plans. */
export const actionLimits = (env: Env): AiActionLimits => {
  const globalRaw = env.AI_GLOBAL_DAILY_ACTIONS;
  const global =
    globalRaw === undefined ? undefined : parsePositiveInt(globalRaw, Number.NaN);
  return {
    free: parsePositiveInt(env.AI_DAILY_ACTIONS_FREE, 30),
    // Launch value per specs/LIMITS.md until AI Gateway shows real cost; the CTO resets it then.
    pro: parsePositiveInt(env.AI_DAILY_ACTIONS_PRO, 200),
    global: global === undefined || Number.isNaN(global) ? undefined : global,
  };
};

export interface BudgetCheck {
  limited: boolean;
  limit: number;
  remaining: number;
}

/** One reserved action in one scope on one day. Release uses the same day it was reserved on. */
export interface UsageReservation {
  scope: string;
  day: string;
  /** Count in this scope right after the reservation. */
  used: number;
  limit: number;
}

export interface UsageStore {
  /** Read-only look at today's count. Never changes it. */
  check(scope: string, limit: number): Promise<BudgetCheck>;
  /** Atomically takes one action if the scope is under its cap. Null means the cap is reached. */
  reserve(scope: string, limit: number): Promise<UsageReservation | null>;
  /** Gives reserved actions back. Counts never go below zero. */
  release(reservations: UsageReservation[]): Promise<void>;
}

/** D1-backed daily counters. Caps survive restarts and enforce per user and globally. */
export const createDbUsageStore = (db: D1Database): UsageStore => {
  const today = () => new Date().toISOString().slice(0, 10);
  return {
    async check(scope, limit) {
      const row = await db
        .prepare("SELECT used FROM ai_usage_daily WHERE scope = ? AND day = ?")
        .bind(scope, today())
        .first<{ used: number }>();
      const used = row?.used ?? 0;
      return { limited: used >= limit, limit, remaining: Math.max(0, limit - used) };
    },
    async reserve(scope, limit) {
      if (limit < 1) return null;
      const day = today();
      // One statement checks the cap and takes the slot, so parallel requests cannot overshoot.
      const row = await db
        .prepare(
          `INSERT INTO ai_usage_daily (scope, day, used) VALUES (?, ?, 1)
           ON CONFLICT (scope, day) DO UPDATE SET used = used + 1
           WHERE ai_usage_daily.used < ?
           RETURNING used`,
        )
        .bind(scope, day, limit)
        .first<{ used: number }>();
      return row ? { scope, day, used: row.used, limit } : null;
    },
    async release(reservations) {
      if (reservations.length === 0) return;
      await db.batch(
        reservations.map((r) =>
          db
            .prepare("UPDATE ai_usage_daily SET used = used - 1 WHERE scope = ? AND day = ? AND used > 0")
            .bind(r.scope, r.day),
        ),
      );
    },
  };
};

export interface ResultCache {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, userId: string, value: unknown): Promise<void>;
}

/** D1-backed result cache. Keys carry the user id so users never share cached results. */
export const createDbCache=(db:D1Database,policy?:()=>AiPolicyFence|undefined):ResultCache=>({
 async get<T>(key:string){const fence=policy?.();await fence?.assertCurrent();const row=await db.prepare(`SELECT c.body FROM ai_results_cache c JOIN ai_policy p ON p.user_id=c.user_id AND p.revision=c.policy_revision WHERE c.key=?${fence?' AND c.user_id=? AND c.policy_revision=?':''}`).bind(key,...(fence?[fence.userId,fence.revision]:[])).first<{body:string}>();await fence?.assertCurrent();if(!row)return undefined;try{return JSON.parse(row.body) as T;}catch{return undefined;}},
 async set(key,userId,value){const fence=policy?.();if(fence&&fence.userId!==userId)throw new ApiError('forbidden','AI result does not belong to this account.');await fence?.assertCurrent();const revision=fence?.revision??(await db.prepare('SELECT revision FROM ai_policy WHERE user_id=?').bind(userId).first<{revision:string}>())?.revision;if(!revision)throw new ApiError('consent_required','AI choices are unavailable.');
  const result=await db.prepare(`INSERT INTO ai_results_cache(key,user_id,body,created_at,policy_revision) SELECT ?1,?2,?3,?4,?5 WHERE EXISTS(SELECT 1 FROM ai_policy WHERE user_id=?2 AND revision=?5) ON CONFLICT(key) DO UPDATE SET body=excluded.body,created_at=excluded.created_at,policy_revision=excluded.policy_revision WHERE EXISTS(SELECT 1 FROM ai_policy WHERE user_id=?2 AND revision=?5)`).bind(key,userId,JSON.stringify(value),new Date().toISOString(),revision).run();if((result.meta.changes??0)===0){if(fence)throw new ApiError('consent_changed','AI choices changed before the result could be saved.');return;}await fence?.assertCurrent();
 }
});

export const cacheKey = (userId: string, prRef: string, headSha: string, kind: string): string =>
  `${userId}:${kind}:${prRef}@${headSha}`;

/** How long a claim on identical work holds before another request may take over (longer than one model call). */
export const INFLIGHT_TTL_MS = 90_000;
/** How long an identical request waits for the first one's result; below the app's 60 s request timeout. */
export const INFLIGHT_WAIT_MS = 50_000;
export const INFLIGHT_POLL_MS = 1_000;

/** Claims `key` for this request. True when it was free or its previous claim expired. */
/** Work leases are scoped to the AI policy revision, so a lease taken before a revoke or re-grant never blocks or feeds later work. */
export const policyWorkKey=(key:string,revision?:string):string=>revision?`${key}:${revision}`:key;

export const claimWork = async (db: D1Database, key: string, userId: string, now = Date.now()): Promise<boolean> => {
  const result = await db
    .prepare(
      `INSERT INTO ai_inflight (key, user_id, expires_at) VALUES (?, ?, ?)
       ON CONFLICT (key) DO UPDATE SET expires_at = excluded.expires_at WHERE ai_inflight.expires_at <= ?`,
    )
    .bind(key, userId, new Date(now + INFLIGHT_TTL_MS).toISOString(), new Date(now).toISOString())
    .run();
  return (result.meta.changes ?? 0) > 0;
};

export const releaseWork = async (db: D1Database, key: string): Promise<void> => {
  await db.prepare("DELETE FROM ai_inflight WHERE key = ?").bind(key).run();
};

export const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

/**
 * Waits for the request that holds `key` to store its result. Undefined when that request ended without one
 * (it failed), so the caller may claim the work itself.
 */
export const waitForResult = async <T>(deps: AiDeps, cache: ResultCache, key: string,workKey=key): Promise<T | undefined> => {
  const wait = deps.sleep ?? sleep;
  for (let waited = 0; waited < INFLIGHT_WAIT_MS; waited += INFLIGHT_POLL_MS) {
    await wait(INFLIGHT_POLL_MS);
    const done = await cache.get<T>(key);
    if (done) return done;
    const holder = await deps.db.prepare("SELECT 1 AS held FROM ai_inflight WHERE key = ?").bind(workKey).first();
    if (!holder) return undefined;
  }
  throw new ApiError("upstream_unavailable", "This summary is still being prepared. Try again in a moment.");
};

export const actionHeaders = (check: { limit: number; remaining: number }): Record<string, string> => ({
  "x-actions-limit": String(check.limit),
  "x-actions-remaining": String(check.remaining),
});

export const secondsToMidnight = (): number =>
  Math.max(
    1,
    Math.ceil((Date.parse(`${new Date().toISOString().slice(0, 10)}T24:00:00Z`) - Date.now()) / 1000),
  );

export interface AiDeps {
  requestId?:string;
  db: D1Database;
  transport: ModelTransport;
  /** Workers AI binding, injected so tests use a fake. */
  ai?: AiBinding | undefined;
  prSource: PrDataSource;
  limits: AiActionLimits;
  /** Waits between checks for identical work in progress; injected so tests do not sleep. */
  sleep?: (ms: number) => Promise<void>;
}

export interface AiStores {
  db?:D1Database;
  policy?:AiPolicyFence;
  consent: ConsentStore;
  usage: UsageStore;
  globalBudget: UsageStore;
  cache: ResultCache;
}

export const storesFor=(db:D1Database):AiStores=>{
 const stores:AiStores={db,consent:createDbConsentStore(db),usage:createDbUsageStore(db),globalBudget:createDbUsageStore(db),cache:createDbCache(db)};
 stores.cache=createDbCache(db,()=>stores.policy);return stores;
};

export interface AiRunResult {
  body: PrSummary | PrRisk;
  limit: number;
  remaining: number;
}

export const USER_LIMIT_MESSAGE = "Daily AI limit reached. Resets at midnight.";
export const GLOBAL_LIMIT_MESSAGE = "AI is paused while usage is over budget.";

export const limitError = (message: string): ApiError =>
  new ApiError("rate_limited", message, { "retry-after": String(secondsToMidnight()) });

/**
 * Consent, plan and a read-only cap check, before any work. This keeps cached results
 * behind the same gate as before; the cap itself is enforced by reservation.
 */
export const gateAction = async (
  stores: AiStores,
  limits: AiActionLimits,
  session: SessionRecord,
  env: Env,
  task: AiTask,
): Promise<{ limit: number; remaining: number; model: Awaited<ReturnType<typeof userModelContext>>; limits: AiActionLimits }> => {
  const key = userKey(session);
  await requireConsent(stores.consent, key);
  stores.policy=await captureAiPolicy(stores.db??requireBinding(env,"DB"),key,task==="summary"||task==="risk");
  const plan = (await getBillingPlan(env, key)).plan;
  const userCheck = await stores.usage.check(key, plan === "pro" ? limits.pro : limits.free);
  if (userCheck.limited) throw limitError(USER_LIMIT_MESSAGE);
  const model = await userModelContext(env, key, task);
  const effectiveLimits = model.ownsMetaKey ? { ...limits, global: undefined } : limits;
  if (effectiveLimits.global !== undefined) {
    const globalCheck = await stores.globalBudget.check("global", effectiveLimits.global);
    if (globalCheck.limited) throw limitError(GLOBAL_LIMIT_MESSAGE);
  }
  return { limit: userCheck.limit, remaining: userCheck.remaining, model, limits: effectiveLimits };
};

/**
 * Takes one action from the user and global budgets before the model is called, runs the
 * work, and gives the action back if the work throws. Owns all usage counting.
 */
export const withReservation = async <T>(
  stores: AiStores,
  limits: AiActionLimits,
  userId: string,
  userLimit: number,
  work: () => Promise<T>,
): Promise<{ value: T; remaining: number }> => {
  await stores.policy?.assertCurrent();
  const held: UsageReservation[] = [];
  const giveBack = async (): Promise<void> => {
    try {
      await stores.usage.release(held);
    } catch {
      // Best effort: a missed release over-counts, which is the safe side, and must not hide the real error.
    }
  };
  try {
    const mine = await stores.usage.reserve(userId, userLimit);
    if (!mine) throw limitError(USER_LIMIT_MESSAGE);
    held.push(mine);
    if (limits.global !== undefined) {
      const shared = await stores.globalBudget.reserve("global", limits.global);
      if (!shared) throw limitError(GLOBAL_LIMIT_MESSAGE);
      held.push(shared);
    }
    return { value: await work(), remaining: Math.max(0, userLimit - mine.used) };
  } catch (error) {
    await giveBack();
    throw error;
  }
};

export const unusableAnswer = (logDetail?: string) =>
  new ApiError("upstream_unavailable", "The AI service returned an unusable answer. Try again.", {}, logDetail);

export interface AnswerSchema<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

/**
 * One metered model call: sends the request, validates the answer against the schema and discards
 * anything invalid. Writes one content-free data point whatever the outcome.
 */
export const runModelTask = async <T>(
  env: Env,
  provider: ModelProvider,
  task: AiTask,
  request: CompletionRequest,
  schema: AnswerSchema<T>,
  policy?:AiPolicyFence,
  onExecution?:(reply:CompletionResult,latencyMs:number)=>void,
): Promise<T> => {
  await policy?.assertCurrent();
  const started = Date.now();
  let reply:CompletionResult|undefined;
  const meter = (outcome: AiOutcome, usage?: { inputTokens: number; outputTokens: number }) =>
    recordAiCall(env.AI_METRICS, {
      task,
      provider: reply?.provider??provider.config.provider,
      modelId: reply?.modelId??provider.config.modelId,
      outcome,
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
      latencyMs: Date.now() - started,
    });
  try {
    reply = await provider.complete(request);
    await policy?.assertCurrent();
  } catch (error) {
    meter("upstream_error");
    if (error instanceof ApiError) throw error;
    throw new ApiError("upstream_unavailable", "The AI service is unavailable. Try again.");
  }
  let json: unknown;
  try {
    json = JSON.parse(stripCodeFences(reply.text)) as unknown;
  } catch {
    meter("invalid_output", reply.usage);
    throw unusableAnswer(`${task} answer was not JSON (${reply.text.length} chars)`);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    meter("invalid_output", reply.usage);
    throw unusableAnswer(`${task} answer did not match the schema`);
  }
  meter("ok", reply.usage);
  onExecution?.(reply,Math.max(0,Date.now()-started));
  return parsed.data;
};
