import { NotificationKind, type NotificationKind as Kind } from '@mergemate/contracts';
import { z } from 'zod';
import { requireBinding } from '../config';
import type { Deps, Env } from '../env';
import { ApiError, ConfigError } from '../errors';
import { sha256Hex } from './crypto';
import { getSettings, inQuietHours } from './settings';
import { IDLE_TTL_MS } from './sessions';

const EXPO_BASE = 'https://exp.host/--/api/v2/push';
const COPY: Record<Kind, string> = {
  review: 'A pull request needs your review.',
  mention: 'You were mentioned in a pull request.',
  mine: 'There is an update on your pull request.',
};
const Outcome = z.object({
  status: z.enum(['ok', 'error']),
  details: z.object({ error: z.string() }).optional(),
});
const Ticket = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), id: z.string().min(1).max(200) }),
  z.object({ status: z.literal('error'), details: z.object({ error: z.string() }).optional() }),
]);
class Suppressed extends Error {}

async function expoRequest(
  env: Env, deps: Deps, endpoint: 'send' | 'getReceipts', body: unknown,
  permitted: () => Promise<boolean> = async () => true,
  retry = true,
): Promise<unknown> {
  const accessToken = env.EXPO_ACCESS_TOKEN?.trim();
  if (!accessToken) throw new ConfigError('EXPO_ACCESS_TOKEN is not set');
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!(await permitted())) throw new Suppressed();
    let response: Response;
    try {
      response = await deps.fetch(`${EXPO_BASE}/${endpoint}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      // Delivery may already have been accepted. Do not blindly retry an ambiguous send.
      throw new ApiError('upstream_unavailable', 'The push service is unavailable.');
    }
    if (retry && attempt === 0 && (response.status === 429 || response.status >= 500)) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      continue;
    }
    if (!response.ok) throw new ApiError('upstream_unavailable', 'The push service rejected the request.');
    try { return await response.json(); }
    catch { throw new ApiError('upstream_unavailable', 'The push service returned an invalid response.'); }
  }
  throw new ApiError('upstream_unavailable', 'The push service is unavailable.');
}

export interface PushNotice { userId: string; kind: Kind; notificationId: string }
interface Device { user_id: string; device_id: string; token: string }

/** Internal sender: callers must resolve the recipient's repository access before calling. */
export async function sendPushNotification(env: Env, deps: Deps, notice: PushNotice, options: { retry?: boolean } = {}) {
  if (!NotificationKind.safeParse(notice.kind).success || !/^[A-Za-z0-9_-]{8,400}$/.test(notice.notificationId)) {
    throw new ApiError('validation_failed', 'Invalid push notification.');
  }
  const db = requireBinding(env, 'DB');
  const user = await db.prepare('SELECT status FROM users WHERE id=?').bind(notice.userId).first<{ status: string }>();
  if (user?.status !== 'active') return { accepted: 0, removed: 0, failed: 0, suppressed: true };
  const permitted = async () => {
    const settings = await getSettings(env, notice.userId);
    return settings.notifications[notice.kind] && !inQuietHours(settings.quietHours, deps.now());
  };
  if (!(await permitted())) return { accepted: 0, removed: 0, failed: 0, suppressed: true };
  const now = deps.now();
  const devices = await db.prepare(`
    SELECT p.user_id,p.device_id,p.token FROM push_tokens p
    JOIN sessions s ON s.token_hash=p.session_hash
    JOIN users u ON u.id=p.user_id
    WHERE p.user_id=? AND s.user_id=p.user_id AND s.demo=0 AND u.status='active'
      AND s.expires_at>? AND s.last_seen_at>?
    ORDER BY p.device_id LIMIT 10
  `).bind(notice.userId, now.toISOString(), new Date(now.getTime() - IDLE_TTL_MS).toISOString()).all<Device>();
  if (!devices.results.length) return { accepted: 0, removed: 0, failed: 0, suppressed: false };
  // Expire messages at the next minute boundary, so they cannot be retained into quiet hours.
  const expiration = Math.floor(now.getTime() / 60_000) * 60 + 60;
  const payload = devices.results.map((device) => ({
    to: device.token, title: 'MergeMate', body: COPY[notice.kind],
    data: { notificationId: notice.notificationId }, expiration,
  }));
  let raw: unknown;
  try { raw = await expoRequest(env, deps, 'send', payload, permitted, options.retry); }
  catch (error) {
    if (error instanceof Suppressed) return { accepted: 0, removed: 0, failed: 0, suppressed: true };
    throw error;
  }
  const parsed = z.object({ data: z.array(Ticket) }).safeParse(raw);
  if (!parsed.success || parsed.data.data.length !== devices.results.length) {
    throw new ApiError('upstream_unavailable', 'The push service returned invalid tickets.');
  }
  let accepted = 0; let removed = 0; let failed = 0;
  for (const [index, ticket] of parsed.data.data.entries()) {
    const device = devices.results[index];
    if (!device) continue;
    if (ticket.status === 'ok') {
      const created = deps.now();
      await db.prepare(`
        INSERT INTO push_receipts(ticket_id,user_id,device_id,token_hash,created_at,next_check_at)
        SELECT ?,p.user_id,p.device_id,?,?,? FROM push_tokens p
        WHERE p.user_id=? AND p.device_id=? AND p.token=?
        ON CONFLICT(ticket_id) DO NOTHING
      `).bind(ticket.id, await sha256Hex(device.token), created.toISOString(),
        new Date(created.getTime() + 15 * 60_000).toISOString(), device.user_id, device.device_id, device.token).run();
      accepted++;
    } else if (ticket.details?.error === 'DeviceNotRegistered') {
      await db.prepare('DELETE FROM push_tokens WHERE user_id=? AND device_id=? AND token=?')
        .bind(device.user_id, device.device_id, device.token).run();
      removed++;
    } else {
      failed++;
    }
  }
  return { accepted, removed, failed, suppressed: false };
}

interface PendingReceipt {
  ticket_id: string; user_id: string; device_id: string; token_hash: string; created_at: string;
}

/** Receipt checking never sends a notification and is safe during quiet hours. */
export async function checkPushReceipts(env: Env, deps: Deps) {
  const db = requireBinding(env, 'DB');
  const now = deps.now();
  const expired = await db.prepare('DELETE FROM push_receipts WHERE created_at<=?')
    .bind(new Date(now.getTime() - 24 * 60 * 60_000).toISOString()).run();
  const pending = await db.prepare('SELECT * FROM push_receipts WHERE next_check_at<=? ORDER BY next_check_at LIMIT 100')
    .bind(now.toISOString()).all<PendingReceipt>();
  if (!pending.results.length) return { checked: 0, expired: expired.meta.changes };
  const raw = await expoRequest(env, deps, 'getReceipts', { ids: pending.results.map((row) => row.ticket_id) });
  const parsed = z.object({ data: z.record(z.string(), Outcome) }).safeParse(raw);
  if (!parsed.success) throw new ApiError('upstream_unavailable', 'The push service returned invalid receipts.');
  for (const row of pending.results) {
    const receipt = parsed.data.data[row.ticket_id];
    if (!receipt) {
      await db.prepare('UPDATE push_receipts SET next_check_at=? WHERE ticket_id=?')
        .bind(new Date(now.getTime() + 5 * 60_000).toISOString(), row.ticket_id).run();
      continue;
    }
    if (receipt.status === 'error' && receipt.details?.error === 'DeviceNotRegistered') {
      const current = await db.prepare('SELECT token FROM push_tokens WHERE user_id=? AND device_id=?')
        .bind(row.user_id, row.device_id).first<{ token: string }>();
      if (current && await sha256Hex(current.token) === row.token_hash) {
        await db.prepare('DELETE FROM push_tokens WHERE user_id=? AND device_id=? AND token=?')
          .bind(row.user_id, row.device_id, current.token).run();
      }
    }
    await db.prepare('DELETE FROM push_receipts WHERE ticket_id=?').bind(row.ticket_id).run();
  }
  return { checked: pending.results.length, expired: expired.meta.changes };
}
