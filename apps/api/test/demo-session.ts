import { createSession } from "../src/lib/sessions";
import type { TestContext } from "./helpers";

/** Issues a bearer demo session in the test database. */
export const demoHeaders = async (ctx: TestContext): Promise<Record<string, string>> => {
  const issued = await createSession(ctx.db as unknown as D1Database, {
    userId: null,
    transport: "bearer",
    now: ctx.time.now(),
  });
  return { Authorization: `Bearer ${issued.token}` };
};
