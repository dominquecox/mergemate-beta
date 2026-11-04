import type { Env } from "../env";
import { ApiError } from "../errors";

/** Operator-only keys in POSTS. Never put these in the public flags:v1 document. */
const SWITCH_KEY = "agent_runs:v1";
const blockedKey = (userId: string) => `agent_blocked:${userId}`;
const VALID_USER_ID = /^[A-Za-z0-9_-]{1,128}$/;

/** Agent runs are on only when the switch is exactly "on". Anything else, a missing key or a KV error means off. */
export async function agentRunsEnabled(env: Env): Promise<boolean> {
  try {
    return (await env.POSTS?.get(SWITCH_KEY)) === "on";
  } catch {
    return false;
  }
}

/** A user is blocked when their key holds any non-empty value. A KV error counts as blocked. */
export async function agentUserBlocked(env: Env, userId: string): Promise<boolean> {
  try {
    if (!env.POSTS) return true;
    // Only well-formed account ids are looked up; anything else is treated as blocked rather than as a key nobody set.
    if (!VALID_USER_ID.test(userId)) return true;
    const value = await env.POSTS.get(blockedKey(userId));
    return typeof value === "string" && value.length > 0;
  } catch {
    return true;
  }
}

/** Call at run start, at approval and right before publish. The two messages do not say which check failed. */
export async function assertAgentRunAllowed(env: Env, userId: string): Promise<void> {
  if (!(await agentRunsEnabled(env))) throw new ApiError("forbidden", "Agent runs are turned off.");
  if (await agentUserBlocked(env, userId)) throw new ApiError("forbidden", "Agent runs are not available for this account.");
}
