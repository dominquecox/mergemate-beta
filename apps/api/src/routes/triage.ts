import { PrRef, TriageChoice, TriageQueue, TriageRecord } from "@mergemate/contracts";
import { Hono } from "hono";
import { requireBinding } from "../config";
import { FIXTURE_TRIAGE, createFetchTransport, noStore } from "./ai-engine";
import type { AiRouterDeps } from "./ai";
import { buildTriageQueue, splitPrRef, triageItemId } from "./triage-engine";
import type { AppEnv } from "../env";
import { ApiError } from "../errors";

export const createTriageRouter = (deps: AiRouterDeps = {}) => {
  const router = new Hono<AppEnv>();
  router.use(noStore);

  router.get("/", async (c) => {
    const session = c.get("session");
    if (session.demo) return c.json(TriageQueue.parse(FIXTURE_TRIAGE));
    const userId = session.userId;
    if (!userId) throw new ApiError("forbidden", "Not available in the demo.");
    const requestDeps = c.get("deps");
    const items = await buildTriageQueue({
      env: c.env,
      deps: requestDeps,
      userId,
      model: {
        transport: deps.transport ?? createFetchTransport(requestDeps.fetch),
        ai: deps.ai ?? c.env.AI,
      },
      requestId: c.get("requestId"),
    });
    return c.json(items);
  });

  router.post("/:prRef", async (c) => {
    const session = c.get("session");
    const userId = session.userId;
    if (session.demo || !userId) throw new ApiError("forbidden", "Not available in the demo.");
    const prRef = c.req.param("prRef");
    if (!PrRef.safeParse(prRef).success) {
      throw new ApiError(
        "validation_failed",
        "That pull request reference is not valid. Send it URL-encoded as owner/repo#number.",
      );
    }
    const parsed = TriageChoice.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) throw new ApiError("validation_failed", "That triage choice is not valid.");
    const { repo, number } = splitPrRef(prRef);
    // The row belongs to the session user; the reference only says which pull request.
    await requireBinding(c.env, "DB")
      .prepare(
        `INSERT INTO triage_choices (user_id, item_id, lane, decided_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (user_id, item_id) DO UPDATE SET lane = excluded.lane, decided_at = excluded.decided_at WHERE triage_choices.lane != excluded.lane`,
      )
      .bind(userId, triageItemId(repo, number), parsed.data.lane, c.get("deps").now().toISOString())
      .run();
    return c.json(TriageRecord.parse({ prRef, lane: parsed.data.lane }));
  });

  // Undo: forget the user's choice so the pull request returns to the queue. Idempotent.
  router.delete("/:prRef", async (c) => {
    const session = c.get("session");
    const userId = session.userId;
    if (session.demo || !userId) throw new ApiError("forbidden", "Not available in the demo.");
    const prRef = c.req.param("prRef");
    if (!PrRef.safeParse(prRef).success) {
      throw new ApiError(
        "validation_failed",
        "That pull request reference is not valid. Send it URL-encoded as owner/repo#number.",
      );
    }
    const { repo, number } = splitPrRef(prRef);
    await requireBinding(c.env, "DB")
      .prepare("DELETE FROM triage_choices WHERE user_id = ? AND item_id = ?")
      .bind(userId, triageItemId(repo, number))
      .run();
    return c.body(null, 204);
  });

  return router;
};
