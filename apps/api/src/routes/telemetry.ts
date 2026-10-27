import { ClientError, TelemetryEvent } from "@mergemate/contracts";
import { type Context, Hono } from "hono";
import { requireBinding } from "../config";
import type { AppEnv } from "../env";
import { ApiError, ConfigError } from "../errors";
import { sha256Hex } from "../lib/crypto";
import { parseValue } from "../lib/validate";

const MAX_BYTES = 4 * 1024;

/**
 * Per-user analytics index. The raw user id never leaves the Worker: the index is a
 * salted hash, and the salt differs per environment so indexes cannot be joined across
 * local, dev, and production datasets.
 */
const userIndex = async (env: AppEnv["Bindings"], userId: string): Promise<string> => {
  const salt = env.TELEMETRY_SALT?.trim();
  if (!salt) throw new ConfigError("TELEMETRY_SALT is not set");
  return sha256Hex(`${salt}:${userId}`);
};

const readSmallJson = async (c: Context<AppEnv>) => {
  const text = await c.req.text();
  if (new TextEncoder().encode(text).length > MAX_BYTES) {
    throw new ApiError("payload_too_large", "Telemetry payload is too large.");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError("validation_failed", "The request is not valid.");
  }
};

/** Signed-in users only (demo sessions cannot write). Stored in Analytics Engine, keyed by salted user hash only. */
export const telemetry = new Hono<AppEnv>()
  .post("/events", async (c) => {
    const event = parseValue(TelemetryEvent, await readSmallJson(c));
    const userId = c.get("session").userId ?? "";
    requireBinding(c.env, "TELEMETRY").writeDataPoint({
      indexes: [await userIndex(c.env, userId)],
      blobs: ["event", event.name, JSON.stringify(event.props ?? {})],
    });
    return c.body(null, 204);
  })

  .post("/telemetry/error", async (c) => {
    const error = parseValue(ClientError, await readSmallJson(c));
    const userId = c.get("session").userId ?? "";
    requireBinding(c.env, "TELEMETRY").writeDataPoint({
      indexes: [await userIndex(c.env, userId)],
      blobs: ["client_error", error.platform, error.appVersion, error.route ?? "", error.message],
    });
    return c.body(null, 204);
  });
