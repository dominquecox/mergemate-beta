import type { Env } from "../env";
import { ApiError } from "../errors";

/** The brain is behind the `brain` switch in the shared flags document; missing or unreadable means off. */
export async function brainEnabled(env: Env): Promise<boolean> {
  try {
    const raw = await env.POSTS?.get("flags:v1", { cacheTtl: 60 });
    const value = raw && raw.length <= 2048 ? (JSON.parse(raw) as unknown) : null;
    return !!value && typeof value === "object" && !Array.isArray(value) && (value as Record<string, unknown>).brain === true;
  } catch {
    return false;
  }
}

export async function requireBrain(env: Env): Promise<void> {
  if (!(await brainEnabled(env))) throw new ApiError("not_found", "Not found.");
}
