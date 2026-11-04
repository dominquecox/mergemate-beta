/**
 * Board track entries for an agent run's steps. Each entry goes only to the card on the run's own branch,
 * on a board owned by the run's user. Entries never carry patch contents, tokens or keys: only the step,
 * its outcome and short identifiers. Best effort: a failed entry never affects the run.
 */
import type { TrackEventKind } from "@mergemate/contracts";
import type { Env } from "../env";

export async function noteRunStep(env: Env, now: Date, input: { runId: string; userId: string; kind?: TrackEventKind; text: string }): Promise<void> {
  if (!env.DB) return;
  try {
    await env.DB.prepare(
      `INSERT INTO brain_events(id,project_id,card_id,kind,actor,text,at)
       SELECT lower(hex(randomblob(16))),c.project_id,c.id,?,'mergemate',?,? FROM brain_cards c JOIN brain_projects p ON p.id=c.project_id
       WHERE c.branch=? AND p.user_id=? LIMIT 5`,
    ).bind(input.kind ?? "note", input.text.replace(/[\r\n]+/g, " ").slice(0, 600), now.toISOString(), `mergemate-agent/${input.runId}`, input.userId).run();
  } catch {
    /* the track entry is informational */
  }
}
