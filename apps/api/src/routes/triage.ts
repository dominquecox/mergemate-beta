import { PrRef, TriageChoice, TriageQueue, TriageRecord } from "@mergemate/contracts";
import type { TriageLane } from "@mergemate/contracts";
import { Hono } from "hono";
import { FIXTURE_TRIAGE, noStore, userKey } from "./ai-engine";
import type { AppEnv } from "../env";
import { ApiError } from "../errors";

/** Per-isolate triage choices, keyed by user then PR reference. */
export const createChoiceStore = () => new Map<string, Map<string, TriageLane>>();
export type ChoiceStore = ReturnType<typeof createChoiceStore>;

export const createTriageRouter = (choices: ChoiceStore = createChoiceStore()) => {
  const router = new Hono<AppEnv>();
  router.use(noStore);

  router.get("/", (c) => {
    const session = c.get("session");
    if (session.demo) return c.json(TriageQueue.parse(FIXTURE_TRIAGE));
    // The inbox queue lands with the notification data layer; until then it is empty.
    return c.json(TriageQueue.parse([]));
  });

  router.post("/:prRef", async (c) => {
    const session = c.get("session");
    if (!PrRef.safeParse(c.req.param("prRef")).success) {
      throw new ApiError(
        "validation_failed",
        "That pull request reference is not valid. Send it URL-encoded as owner/repo#number.",
      );
    }
    const parsed = TriageChoice.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) throw new ApiError("validation_failed", "That triage choice is not valid.");
    const prRef = c.req.param("prRef");
    const userId = userKey(session);
    let byUser = choices.get(userId);
    if (!byUser) {
      byUser = new Map<string, TriageLane>();
      choices.set(userId, byUser);
    }
    byUser.set(prRef, parsed.data.lane);
    return c.json(TriageRecord.parse({ prRef, lane: parsed.data.lane }));
  });

  return router;
};
