import {captureAiPolicy} from '../lib/ai-policy';
import { ModelTriage, PrRef, TriageQueue } from "@mergemate/contracts";
import type { Notification, TriageItem, TriageLane } from "@mergemate/contracts";
import { requireBinding } from "../config";
import type { Deps, Env } from "../env";
import { ApiError, ConfigError } from "../errors";
import { createModelProvider } from "../ai/provider";
import { userModelContext } from "../lib/user-meta-key";
import { fundingLimits, triagePoolLimit, userDailyLimit } from "./ai-engine-gate";
import type { ModelProvider, ProviderDeps } from "../ai/provider";
import { TRIAGE_JSON_SCHEMA } from "../ai/schemas";
import { fetchPrDetail } from "./github";
import { githubGet } from "../lib/github";
import { getAccessToken } from "../lib/github-tokens";
import { getSettings } from "../lib/settings";
import { getBillingPlan } from "../lib/stripe-billing";
import { CONSENT_VERSION } from "./consent";
import {
  DATA_NOTICE,
  actionLimits,
  assessQuality,
  buildDiffContext,
  buildPrPrompt,
  cacheKey,
  commonSignals,
  isBotLogin,
  redactSecrets,
  runModelTask,
  scoreTriageLane,
  storesFor,
  toPrData,
  withReservation,
} from "./ai-engine";
import type { AiStores, PrData } from "./ai-engine";
import { notificationId } from "../lib/notification-id";
import { loadInbox } from "./notifications";

/** Most items one queue request returns (the default page size). */
export const TRIAGE_QUEUE_LIMIT = 25;
const MAX_INBOX_PAGES = 3;
const FETCH_CONCURRENCY = 5;
const AI_CONCURRENCY = 4;
/** After this many failed model calls in one request, stop asking and keep the rules lanes. */
const MAX_AI_FAILURES = 3;
const ID_CHUNK = 90;
const MAX_AI_REASONS = 3;
const MAX_REASON_CHARS = 200;
export const TRIAGE_MAX_TOKENS = 300;

/**
 * Triage scoring has its own daily budget, separate from the summary and risk actions, so opening the
 * deck never uses up a user's summaries. It still counts toward the global budget.
 */
export const triageScope = (userId: string): string => `${userId}:triage`;
const triageDailyLimit = (env: Env, plan: string): number => {
  const raw = plan === "pro" ? env.AI_DAILY_TRIAGE_PRO : env.AI_DAILY_TRIAGE_FREE;
  const value = Number(raw?.trim());
  if (raw?.trim() && Number.isSafeInteger(value) && value > 0) return value;
  return plan === "pro" ? 50 : 10;
};

export const TRIAGE_SYSTEM =
  `You triage GitHub pull requests for a reviewer. Reply with JSON only, exactly {"lane": "needs_you"|"fyi"|"ignore", "reasons": string[]}. ` +
  `needs_you means the reviewer must look closely, fyi means a quick glance is enough, ignore means no action is needed. ` +
  DATA_NOTICE;

const LANE_RANK: Record<TriageLane, number> = { ignore: 0, fyi: 1, needs_you: 2 };
const higherLane = (a: TriageLane, b: TriageLane): TriageLane => (LANE_RANK[b] > LANE_RANK[a] ? b : a);

/** Id under which a triage choice is stored: the inbox id of the pull request, with the repository lower-cased. */
export const triageItemId = (repo: string, number: number): string => notificationId(repo.toLowerCase(), number);

/** Splits `owner/repo#number`. The caller has already validated the reference. */
export const splitPrRef = (prRef: string): { repo: string; number: number } => {
  const at = prRef.lastIndexOf("#");
  return { repo: prRef.slice(0, at), number: Number(prRef.slice(at + 1)) };
};

interface RulesLane {
  lane: TriageLane;
  reason: string;
  reasons: string[];
}

/**
 * Deterministic lane: quality signals through `scoreTriageLane`, plus masked secret findings.
 * A draft with no signals that nobody asked the user to review goes to ignore.
 */
const rulesLane = (item: Notification, data: PrData | null): RulesLane => {
  const signals = data ? commonSignals(data) : null;
  const quality = assessQuality(
    signals
      ? signals.qualityInput
      : // Details unavailable: only what the inbox itself shows.
        {
          authorIsBot: isBotLogin(item.author),
          coAuthoredByBot: false,
          hasTests: null,
          hasTodo: false,
          checksFailing: null,
          filesOutsideScope: false,
          totalChanged: 0,
          classifierScore: null,
        },
  );
  const reasons = [...quality.reasons];
  if (signals && signals.secretFindings.length > 0) {
    reasons.unshift("Possible secret in this PR (values masked).");
  }
  const scored = scoreTriageLane({ needsCloserLook: reasons.length > 0, reasons });
  if (reasons.length === 0) {
    if (item.status === "draft" && item.kind !== "review") {
      const reason = "Draft: not ready for review yet.";
      return { lane: "ignore", reason, reasons: [reason] };
    }
    if (!data) {
      const reason = "Details unavailable right now.";
      return { lane: "fyi", reason, reasons: [reason] };
    }
    return { lane: scored.lane, reason: scored.reason, reasons: [scored.reason] };
  }
  return { lane: scored.lane, reason: scored.reason, reasons };
};

/** Runs `fn` over `items` with at most `size` in flight. Results keep the input order. */
const mapPool = async <T, R>(items: readonly T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> => {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      out[index] = await fn(items[index] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return out;
};

/** Ids among `itemIds` that the user has already triaged. Scoped to the user. */
const triagedAmong = async (db: D1Database, userId: string, itemIds: string[]): Promise<Set<string>> => {
  const found = new Set<string>();
  for (let i = 0; i < itemIds.length; i += ID_CHUNK) {
    const chunk = itemIds.slice(i, i + ID_CHUNK);
    const rows = await db
      .prepare(`SELECT item_id FROM triage_choices WHERE user_id = ? AND item_id IN (${chunk.map(() => "?").join(",")})`)
      .bind(userId, ...chunk)
      .all<{ item_id: string }>();
    for (const row of rows.results) found.add(row.item_id);
  }
  return found;
};

/** The user's open inbox items that they have not triaged yet, newest first, at most the queue limit. */
const openItems = async (env: Env, deps: Deps, userId: string): Promise<Notification[]> => {
  const db = requireBinding(env, "DB");
  const seen = new Set<string>();
  const kept: Notification[] = [];
  for (let page = 1; page <= MAX_INBOX_PAGES && kept.length < TRIAGE_QUEUE_LIMIT; page += 1) {
    const inbox = await loadInbox(env, deps, userId, "all", page);
    const ids = inbox.items.map((n) => triageItemId(n.repo, n.number));
    const done = await triagedAmong(db, userId, ids);
    inbox.items.forEach((n, i) => {
      const id = ids[i] as string;
      if (done.has(id) || seen.has(id)) return;
      seen.add(id);
      kept.push(n);
    });
    if (!inbox.nextCursor) break;
  }
  return kept
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, TRIAGE_QUEUE_LIMIT);
};

const cleanReason = (text: string): string => text.replace(/\p{Cc}+/gu, " ").replace(/\s+/g, " ").trim().slice(0, MAX_REASON_CHARS);

const cleanReasons = (reasons: string[]): string[] =>
  reasons.map(cleanReason).filter((r) => r.length > 0).slice(0, MAX_AI_REASONS);

interface Candidate {
  item: Notification;
  prRef: string;
  rules: RulesLane;
  data: PrData | null;
  ai: ModelTriage | null;
}

/** AI scoring needs consent to the current version and the AI setting on. Anything unreadable counts as off. */
const aiAllowed = async (env: Env, stores: AiStores, userId: string): Promise<boolean> => {
  const consent = await stores.consent.read(userId);
  if (!consent.granted || consent.version !== CONSENT_VERSION) return false;
  try {
    return (await getSettings(env, userId)).aiSummaries;
  } catch {
    return false;
  }
};

export interface TriageQueueInput {
  env: Env;
  deps: Deps;
  userId: string;
  model: ProviderDeps;
  requestId?: string | undefined;
}

/**
 * Builds the signed-in user's triage queue from their own inbox. Lanes start from deterministic
 * rules; the model may only raise them, within the daily caps. Nothing here fails the whole queue
 * for a model, cap or single-item problem.
 */
export const buildTriageQueue = async (input: TriageQueueInput): Promise<TriageItem[]> => {
  const { env, deps, userId } = input;
  const items = await openItems(env, deps, userId);
  if (items.length === 0) return [];

  // The user's own token, so GitHub enforces their access to every pull request.
  const token = await getAccessToken(env, userId, deps.now());
  const candidates = (
    await mapPool(items, FETCH_CONCURRENCY, async (item): Promise<Candidate | null> => {
      const prRef = `${item.repo}#${item.number}`;
      if (!PrRef.safeParse(prRef).success) return null;
      const [owner, repo] = item.repo.split("/") as [string, string];
      let data: PrData | null = null;
      try {
        const detail = await fetchPrDetail(deps, token, owner, repo, item.number);
        const commits = await githubGet<Parameters<typeof toPrData>[1]>(
          deps,
          token,
          `/repos/${owner}/${repo}/pulls/${item.number}/commits?per_page=100`,
        );
        data = toPrData(detail, commits);
      } catch (error) {
        if (error instanceof ApiError) {
          // No access to this pull request: it does not appear.
          if (error.code === "not_found" || error.code === "forbidden" || error.code === "sso_required") return null;
          if (error.code === "unauthorized") throw error;
        }
        // Anything else is a hiccup on one item: keep it with what the inbox shows.
      }
      return { item, prRef, rules: rulesLane(item, data), data, ai: null };
    })
  ).filter((c): c is Candidate => c !== null);

  const stores = storesFor(requireBinding(env, "DB"));
  if(await aiAllowed(env,stores,userId)){try{stores.policy=await captureAiPolicy(requireBinding(env,'DB'),userId,true);await scoreWithModel(input,stores,candidates);await stores.policy.assertCurrent();}catch{for(const candidate of candidates)candidate.ai=null;}}

  return TriageQueue.parse(
    candidates.map(({ item, prRef, rules, ai }): TriageItem => {
      const lane = ai ? higherLane(rules.lane, ai.lane) : rules.lane;
      const raised = lane !== rules.lane;
      const aiReasons = ai ? cleanReasons(ai.reasons) : [];
      const reasons = [...rules.reasons, ...aiReasons].filter((r, i, all) => all.indexOf(r) === i);
      return {
        prRef,
        lane,
        reason: raised && aiReasons[0] ? aiReasons[0] : rules.reason,
        reasons,
        source: ai ? "ai" : "rules",
        title: item.title,
        author: item.author,
      };
    }),
  );
};

/**
 * Fills `candidate.ai` from the result cache, then from the model for what is left. Only items the
 * rules put below needs_you are sent: nothing the model says can lower needs_you, so asking would
 * only spend an action. One reserved action per model call; when a cap is reached the rest keep
 * their rules lanes.
 */
const scoreWithModel = async (input: TriageQueueInput, stores: AiStores, candidates: Candidate[]): Promise<void> => {
  const { env, userId } = input;
  const open = candidates.filter((c) => c.data && c.rules.lane !== "needs_you");
  const keyOf = (c: Candidate) => cacheKey(userId, c.prRef, (c.data as PrData).headSha, "triage");

  const toAsk: Candidate[] = [];
  for (const c of open) {
    const hit = ModelTriage.safeParse(await stores.cache.get<unknown>(keyOf(c)).catch(() => undefined));
    if (hit.success) c.ai = hit.data;
    else toAsk.push(c);
  }
  if (toAsk.length === 0) return;

  // Same funding rule as other AI: the user's own Meta key when saved (no plan cap), else the shared pool.
  const owned = await userModelContext(env, userId, "triage").catch(() => null);
  if (!owned) return;
  let provider: ModelProvider;
  try {
    provider = createModelProvider(owned.env, "triage", input.model);
  } catch (error) {
    // Misconfigured route: keep the rules lanes and leave a content-free trace for operators.
    if (error instanceof ConfigError) {
      console.error(JSON.stringify({ requestId: input.requestId, code: error.code, detail: error.detail }));
      return;
    }
    throw error;
  }

  const limits = fundingLimits(owned.ownsMetaKey, actionLimits(env));
  const plan = (await getBillingPlan(env, userId)).plan;
  const planLimit = userDailyLimit(owned.ownsMetaKey, triageDailyLimit(env, plan));
  const userLimit = triagePoolLimit(limits, planLimit);

  let stopped = false;
  let failures = 0;
  let next = 0;
  const worker = async (): Promise<void> => {
    while (!stopped && next < toAsk.length) {
      const c = toAsk[next++] as Candidate;
      const data = c.data as PrData;
      // Each route gets only as much PR context as its model's window holds.
      const { context } = buildDiffContext(data, provider.config.maxInputChars);
      const { text } = redactSecrets(context);
      try {
        const { value } = await withReservation(stores, limits, triageScope(userId), userLimit, async () => {
          const answer = await runModelTask(
            env,
            provider,
            "triage",
            {
              system: TRIAGE_SYSTEM,
              prompt: buildPrPrompt(text),
              maxOutputTokens: TRIAGE_MAX_TOKENS,
              jsonSchema: TRIAGE_JSON_SCHEMA,
            },
            ModelTriage,stores.policy,
          );
          // A failed cache write must not lose a paid answer or give the action back.
          await stores.cache.set(keyOf(c),userId,answer).catch(error=>{if(error instanceof ApiError&&['consent_required','consent_changed','forbidden'].includes(error.code))throw error;});
          return answer;
        });
        await stores.policy?.assertCurrent();c.ai = value;
      } catch (error) {
        if (error instanceof ApiError && ["rate_limited","consent_required","consent_changed","forbidden"].includes(error.code)) stopped = true;
        else if (++failures >= MAX_AI_FAILURES) stopped = true;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(AI_CONCURRENCY, toAsk.length) }, worker));
};
