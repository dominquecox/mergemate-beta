import { ConsentState, ConsentUpdate } from "@mergemate/contracts";
import { Hono } from "hono";
import { requireBinding } from "../config";
import { noStore, userKey } from "./ai-engine";
import type { AppEnv } from "../env";
import { ApiError } from "../errors";

/** Current consent text version. Old grants stop counting when this changes. */
export const CONSENT_VERSION = "1";

export interface ConsentRecord {
  granted: boolean;
  version: string;
  at?: string;
}

export interface ConsentStore {
  read(userId: string): Promise<ConsentRecord>;
  write(userId: string, granted: boolean): Promise<ConsentRecord>;
}

/** D1-backed consent store. Grants survive restarts and die with the user. */
export const createDbConsentStore = (db: D1Database): ConsentStore => ({
  async read(userId) {
    const row = await db
      .prepare("SELECT granted, version, at FROM consent_grants WHERE user_id = ?")
      .bind(userId)
      .first<{ granted: number; version: string; at: string }>();
    if (!row) return { granted: false, version: CONSENT_VERSION };
    return { granted: row.granted === 1, version: row.version, at: row.at };
  },
  async write(userId, granted) {
    const at = new Date().toISOString();
    await db
      .prepare(
        `INSERT INTO consent_grants (user_id, granted, version, at) VALUES (?, ?, ?, ?)
         ON CONFLICT (user_id) DO UPDATE SET granted = excluded.granted, version = excluded.version, at = excluded.at`,
      )
      .bind(userId, granted ? 1 : 0, CONSENT_VERSION, at)
      .run();
    return { granted, version: CONSENT_VERSION, at };
  },
});

/** Throws consent_required unless the user granted the current version. */
export const requireConsent = async (store: ConsentStore, userId: string): Promise<void> => {
  const record = await store.read(userId);
  if (!record.granted || record.version !== CONSENT_VERSION) {
    throw new ApiError(
      "consent_required",
      "AI features need your consent first. Review and accept in Settings.",
    );
  }
};

const ungranted = () => ({ ai: { granted: false, version: CONSENT_VERSION, currentVersion: CONSENT_VERSION } });

/** Validates a consent update body, including the current version. */
export const parseConsentUpdate = (body: unknown): { granted: boolean } => {
  const parsed = ConsentUpdate.safeParse(body);
  if (!parsed.success) throw new ApiError("validation_failed", "That consent update is not valid.");
  if (parsed.data.ai.version !== CONSENT_VERSION) {
    throw new ApiError("validation_failed", "That consent version is out of date.");
  }
  return { granted: parsed.data.ai.granted };
};

export const createConsentRouter = (store?: ConsentStore) => {
  const router = new Hono<AppEnv>();
  router.use(noStore);

  const consent = (db: D1Database): ConsentStore => store ?? createDbConsentStore(db);

  router.get("/", async (c) => {
    const session = c.get("session");
    if (session.demo) return c.json(ConsentState.parse(ungranted()));
    const db = requireBinding(c.env, "DB");
    return c.json(ConsentState.parse({ ai: { ...(await consent(db).read(userKey(session))), currentVersion: CONSENT_VERSION } }));
  });

  router.put("/", async (c) => {
    const session = c.get("session");
    const db = requireBinding(c.env, "DB");
    const update = parseConsentUpdate(await c.req.json().catch(() => null));
    const record = await consent(db).write(userKey(session), update.granted);
    return c.json(ConsentState.parse({ ai: { ...record, currentVersion: CONSENT_VERSION } }));
  });

  return router;
};
