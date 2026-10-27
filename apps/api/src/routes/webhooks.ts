import { Hono } from "hono";
import { requireBinding } from "../config";
import type { AppEnv } from "../env";
import { ApiError, ConfigError } from "../errors";
import { type GitHubEventMessage, toWebhookData, verifyGitHubSignature } from "../lib/github-webhooks";

const MAX_WEBHOOK_BYTES = 5 * 1024 * 1024;
const DELIVERY_ID = /^[A-Za-z0-9-]{1,64}$/;

const tooLarge = () => new ApiError("payload_too_large", "Payload is too large.");

/**
 * GitHub webhooks: size cap and signature check on the raw body before anything is parsed,
 * then dedupe by delivery id and hand off to the queue. Acknowledges without doing the work.
 */
export const webhooks = new Hono<AppEnv>().post("/webhooks/github", async (c) => {
  if (Number(c.req.header("content-length") ?? 0) > MAX_WEBHOOK_BYTES) throw tooLarge();
  const raw = await c.req.arrayBuffer();
  if (raw.byteLength > MAX_WEBHOOK_BYTES) throw tooLarge();

  const secrets = [c.env.GITHUB_WEBHOOK_SECRET?.trim(), c.env.GITHUB_WEBHOOK_SECRET_NEXT?.trim()];
  if (!secrets.some(Boolean)) throw new ConfigError("GITHUB_WEBHOOK_SECRET is not set");
  if (!(await verifyGitHubSignature(secrets, raw, c.req.header("x-hub-signature-256")))) {
    throw new ApiError("unauthorized", "Invalid signature.");
  }

  const event = c.req.header("x-github-event") ?? "";
  const deliveryId = c.req.header("x-github-delivery") ?? "";
  if (event === "ping") return c.json({ ok: true });
  if (!DELIVERY_ID.test(deliveryId)) throw new ApiError("validation_failed", "Missing delivery id.");

  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    throw new ApiError("validation_failed", "Payload is not JSON.");
  }
  const data = toWebhookData(event, payload);
  if (!data) return c.json({ ignored: true }, 202);

  const db = requireBinding(c.env, "DB");
  const queue = requireBinding(c.env, "GITHUB_EVENTS");
  const receivedAt = c.get("deps").now().toISOString();
  const inserted = await db
    .prepare("INSERT INTO github_deliveries (delivery_id, event, received_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING")
    .bind(deliveryId, event, receivedAt)
    .run();
  if (!inserted.meta.changes) return c.json({ duplicate: true });

  const message: GitHubEventMessage = { deliveryId, event, receivedAt, data };
  try {
    await queue.send(message);
  } catch {
    // Forget the delivery so GitHub's redelivery is accepted.
    await db.prepare("DELETE FROM github_deliveries WHERE delivery_id = ?").bind(deliveryId).run();
    throw new ApiError("upstream_unavailable", "Could not queue the event.");
  }
  return c.json({ queued: true }, 202);
});
