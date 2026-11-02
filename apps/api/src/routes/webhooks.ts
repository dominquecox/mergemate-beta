import { Hono } from "hono";
import { readBoundedBody } from "../lib/bounded-body";
import { requireBinding } from "../config";
import type { AppEnv } from "../env";
import { ApiError, ConfigError } from "../errors";
import { type GitHubEventMessage, toWebhookData, verifyGitHubSignature } from "../lib/github-webhooks";

const MAX_WEBHOOK_BYTES = 5 * 1024 * 1024;
const DELIVERY_ID = /^[A-Za-z0-9-]{1,64}$/;

/**
 * GitHub webhooks: size cap and signature check on the raw body before anything is parsed,
 * then dedupe by delivery id and hand off to the queue. Acknowledges without doing the work.
 */
export const webhooks = new Hono<AppEnv>().post("/webhooks/github", async (c) => {
  const raw = await readBoundedBody(c.req.raw, MAX_WEBHOOK_BYTES);

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
    .prepare("INSERT INTO github_deliveries (delivery_id, event, received_at, queued) VALUES (?, ?, ?, 0) ON CONFLICT DO NOTHING")
    .bind(deliveryId, event, receivedAt)
    .run();
  if (!inserted.meta.changes) {
    const existing = await db.prepare("SELECT queued FROM github_deliveries WHERE delivery_id=?").bind(deliveryId).first<{ queued: number }>();
    if (existing?.queued === 1) return c.json({ duplicate: true });
    // A previous Worker may have stopped between the durable insert and queue send.
    // Re-enqueue pending deliveries; consumers and push claims tolerate duplicates.
  }

  const sender = (payload as {sender?:{login?:unknown}})?.sender?.login;
  const actor = typeof sender==='string' && /^[A-Za-z0-9_-]{1,100}$/.test(sender) ? sender : undefined;
  const message: GitHubEventMessage = { deliveryId, event, receivedAt, data, ...(actor?{actor}:{}) };
  try {
    await queue.send(message);
    await db.prepare("UPDATE github_deliveries SET queued=1 WHERE delivery_id=?").bind(deliveryId).run();
  } catch {
    // Forget the delivery so GitHub's redelivery is accepted.
    await db.prepare("DELETE FROM github_deliveries WHERE delivery_id = ?").bind(deliveryId).run();
    throw new ApiError("upstream_unavailable", "Could not queue the event.");
  }
  return c.json({ queued: true }, 202);
});
