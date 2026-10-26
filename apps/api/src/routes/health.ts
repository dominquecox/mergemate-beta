import type { HealthResponse } from "@mergemate/contracts";
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { VERSION } from "../version";

export const health = new Hono<AppEnv>().get("/", (c) => {
  const body: HealthResponse = { ok: true, version: VERSION };
  return c.json(body);
});
