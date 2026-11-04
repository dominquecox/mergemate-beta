/**
 * Board card → agent run → draft PR.
 *
 * The owner asks an agent to work a card. That starts an ordinary code-fix
 * workflow run on the board's repository, so every existing guardrail applies
 * unchanged:
 * - the patch is generated from the pinned repository files through the AI gate,
 *   inside the patch boundary and size limits;
 * - the owner approves the exact patch hash with a stored, single-use passkey approval;
 * - isolated tests run;
 * - the API opens a DRAFT pull request on `mergemate-agent/<runId>`, never the base
 *   branch, and never merges.
 *
 * When that draft PR is published, the card on the run's branch is linked to it.
 */
import type { WorkflowRun } from "@mergemate/contracts";
import type { Deps, Env } from "../env";
import { ApiError } from "../errors";
import type { SessionRecord } from "../lib/sessions";
import { cancelWorkflowRun } from "../workflows/runtime";
import { boardRunDefinition, prepareBoardRun } from "./worker-agent";
import { noteRunStep } from "./run-events";
import { assertAgentRunAllowed } from "./kill-switch";
import { newAgentSecret } from "./agent-auth";
import { LOCK_TTL_SECONDS, acquireLock, cardIn, db, lockOnCard, ownedProject } from "./store";

const RUN_BRANCH = (runId: string) => `mergemate-agent/${runId}`;
/** Agent runs started from boards in a rolling day: per board, and per user across all boards. */
export const MAX_RUNS_PER_BOARD_PER_DAY = 10;
export const MAX_RUNS_PER_USER_PER_DAY = 20;
const ACTIVE_RUN_STATUSES = new Set(["queued", "running", "waiting_executor", "waiting_approval"]);

/** The card, its done-when and the project rules, as the run's task. Bounded to the workflow intent limit. */
export function cardIntent(card: { title: string; details: string; done_when: string }, rules: string): string {
  return [`Board card: ${card.title}`, card.details, `Done when: ${card.done_when}`, `Project rules: ${rules}`].join("\n\n").slice(0, 2000).trim();
}

export async function startCardAgentRun(env: Env, deps: Deps, session: SessionRecord, projectId: string, cardId: string): Promise<{ run: WorkflowRun | null; branch: string | null; summary?: string; files?: string[] }> {
  if (!session.userId || session.demo) throw new ApiError("forbidden", "Sign in with GitHub to use boards.");
  await assertAgentRunAllowed(env, session.userId);
  const project = await ownedProject(env, session.userId, projectId), card = await cardIn(env, project.id, cardId), now = deps.now();
  if (card.status !== "open" && card.status !== "active") throw new ApiError("state_conflict", "Only an open or active card can be worked by an agent.");

  // One run per card at a time: an unfinished run on this card is returned instead of starting another.
  const current = card.branch?.startsWith("mergemate-agent/") ? card.branch.slice("mergemate-agent/".length) : null;
  if (current) {
    const row = await db(env).prepare("SELECT body_json FROM workflow_runs WHERE id=? AND user_id=?").bind(current, session.userId).first<{ body_json: string }>();
    const run = row ? (JSON.parse(row.body_json) as WorkflowRun) : null;
    if (run && ACTIVE_RUN_STATUSES.has(run.status)) return { run, branch: RUN_BRANCH(run.id) };
  }
  const seat = `owner:${project.id}`, holder = await lockOnCard(env, card.id, now);
  if (holder && holder.token_id !== seat) throw new ApiError("state_conflict", "Another agent holds this card. Wait for its handoff.");

  const since = new Date(now.getTime() - 86_400_000).toISOString();
  const counts = await db(env).prepare(`SELECT
      (SELECT COUNT(*) FROM brain_events WHERE project_id=? AND kind='note' AND actor='owner' AND text LIKE 'Agent run started%' AND at>?) AS board,
      (SELECT COUNT(*) FROM workflow_runs WHERE user_id=? AND idempotency_key LIKE 'brain-%' AND created_at>?) AS user`)
    .bind(project.id, since, session.userId, since).first<{ board: number; user: number }>();
  if ((counts?.board ?? 0) >= MAX_RUNS_PER_BOARD_PER_DAY) throw new ApiError("rate_limited", `A board can start at most ${MAX_RUNS_PER_BOARD_PER_DAY} agent runs a day.`);
  if ((counts?.user ?? 0) >= MAX_RUNS_PER_USER_PER_DAY) throw new ApiError("rate_limited", `You can start at most ${MAX_RUNS_PER_USER_PER_DAY} agent runs a day.`);

  const definition = boardRunDefinition({ title: card.title, intent: cardIntent(card, project.rules), owner: project.owner, repo: project.repo });
  // The agent plans in the Worker before anything on the board changes, so a refused or empty plan leaves the card untouched.
  const prepared = await prepareBoardRun(env, deps, session, definition);
  if (prepared.kind === "no_change") return { run: null, branch: null, summary: prepared.summary, files: [] };
  const run = prepared.run;

  // The owner works the card through their seat, on the same lock rules as an agent.
  if (holder) {
    // Keep the owner's lock for the run's duration.
    await db(env).prepare("UPDATE brain_locks SET expires_at=? WHERE card_id=? AND token_id=?").bind(new Date(now.getTime() + LOCK_TTL_SECONDS * 1000).toISOString(), card.id, seat).run();
  } else {
    await db(env).prepare("DELETE FROM brain_locks WHERE token_id=? AND project_id=?").bind(seat, project.id).run();
    await db(env).prepare("INSERT INTO brain_agent_tokens(id,project_id,name,tool,token_hash,created_at) VALUES(?,?,'owner','mergemate',?,?) ON CONFLICT(id) DO NOTHING")
      .bind(seat, project.id, (await newAgentSecret()).hash, now.toISOString()).run();
    const lock = await acquireLock(env, { projectId: project.id, cardId: card.id, tokenId: seat, agent: "owner", tool: "mergemate", now, ttlSeconds: LOCK_TTL_SECONDS });
    if (!lock) {
      await cancelWorkflowRun(env, deps, session.userId, run.id).catch(() => undefined);
      throw new ApiError("state_conflict", "Another agent took this card. Try again after its handoff.");
    }
  }
  const branch = RUN_BRANCH(run.id), at = deps.now().toISOString();
  await db(env).batch([
    db(env).prepare("UPDATE brain_cards SET branch=?,status='active',updated_at=? WHERE id=? AND project_id=?").bind(branch, at, card.id, project.id),
    db(env).prepare("INSERT INTO brain_events(id,project_id,card_id,kind,actor,text,at) VALUES(?,?,?,'note','owner',?,?)")
      .bind(crypto.randomUUID(), project.id, card.id, "Agent run started. The agent planned a patch; approve it with a passkey to open a draft PR.", at),
  ]);
  await noteRunStep(env, deps.now(), { runId: run.id, userId: session.userId, text: `Agent planned patch (${prepared.files.length} files). Review and approve it with a passkey to open a draft PR.` });
  return { run, branch, summary: prepared.summary, files: prepared.files };
}

/**
 * Links the card worked by this run to its published draft PR. Only cards on the run's own branch, on a board
 * owned by the run's user for the same repository, are linked, so a branch name set elsewhere cannot borrow it.
 */
export async function linkCardToDraft(env: Env, now: Date, input: { runId: string; userId: string; repository: string; commitSha: string; draftPrUrl: string }): Promise<number> {
  const number = Number(/\/pull\/(\d{1,9})$/.exec(input.draftPrUrl)?.[1]);
  if (!Number.isSafeInteger(number) || number < 1 || !/^[0-9a-f]{40}$/.test(input.commitSha)) return 0;
  const [owner, repo] = input.repository.split("/");
  const d = db(env), at = now.toISOString(), branch = RUN_BRANCH(input.runId);
  const match = "SELECT c.id,c.project_id FROM brain_cards c JOIN brain_projects p ON p.id=c.project_id WHERE c.branch=? AND p.user_id=? AND lower(p.owner)=lower(?) AND lower(p.repo)=lower(?)";
  const cards = (await d.prepare(match).bind(branch, input.userId, owner ?? "", repo ?? "").all<{ id: string; project_id: string }>()).results ?? [];
  if (!cards.length) return 0;
  await d.batch(cards.flatMap((card) => [
    d.prepare("UPDATE brain_cards SET pr_number=?,head=?,status='review',updated_at=? WHERE id=? AND project_id=?").bind(number, input.commitSha, at, card.id, card.project_id),
    d.prepare("INSERT INTO brain_events(id,project_id,card_id,kind,actor,text,at) VALUES(?,?,?,'pr_opened','mergemate',?,?)")
      .bind(crypto.randomUUID(), card.project_id, card.id, `Draft PR #${number} opened at ${input.commitSha.slice(0, 12)} from the passkey-approved patch.`, at),
    d.prepare("DELETE FROM brain_locks WHERE card_id=? AND project_id=?").bind(card.id, card.project_id),
  ]));
  return cards.length;
}
