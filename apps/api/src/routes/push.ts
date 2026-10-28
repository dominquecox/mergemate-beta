import { PushTokenRegistration, PushTokenRemoval, WebPushSubscription } from '@mergemate/contracts';
import { Hono } from 'hono';
import { requireBinding } from '../config';
import type { AppEnv } from '../env';
import { ApiError } from '../errors';
import { fromBase64url } from '../lib/crypto';
import { parseBody } from '../lib/validate';
import { loadVapid } from '../lib/web-push';

export const push = new Hono<AppEnv>()
  .post('/push/tokens', async (c) => {
    const session = c.get('session');
    if (session.demo || !session.userId) throw new ApiError('forbidden', 'Not available in the demo.');
    const input = await parseBody(c, PushTokenRegistration);
    let row: { device_id: string } | null;
    try {
      row = await requireBinding(c.env, 'DB').prepare(`
        INSERT INTO push_tokens(user_id,device_id,token,session_hash,updated_at)
        SELECT ?,?,?,?,? WHERE (SELECT count(*) FROM push_tokens WHERE user_id=?) < 10
          OR EXISTS(SELECT 1 FROM push_tokens WHERE user_id=? AND device_id=?)
        ON CONFLICT(user_id,device_id) DO UPDATE SET token=excluded.token,
          session_hash=excluded.session_hash,updated_at=excluded.updated_at
        RETURNING device_id
      `).bind(session.userId, input.deviceId, input.token, session.tokenHash, c.get('deps').now().toISOString(),
        session.userId, session.userId, input.deviceId).first<{ device_id: string }>();
    } catch {
      throw new ApiError('forbidden', 'This device token could not be registered. Remove its previous registration first.');
    }
    if (!row) throw new ApiError('forbidden', 'Remove an unused device before registering another one.');
    return c.json({ registered: true }, 201);
  })
  .delete('/push/tokens', async (c) => {
    const session = c.get('session');
    if (session.demo || !session.userId) throw new ApiError('forbidden', 'Not available in the demo.');
    const input = await parseBody(c, PushTokenRemoval);
    await requireBinding(c.env, 'DB').prepare('DELETE FROM push_tokens WHERE user_id=? AND device_id=?')
      .bind(session.userId, input.deviceId).run();
    return c.body(null, 204);
  })
  // Browser notifications (Web Push). Same rules as device tokens: signed-in sessions only, tied to the session.
  .get('/push/web-key', async (c) => {
    const session = c.get('session');
    if (session.demo || !session.userId) throw new ApiError('forbidden', 'Not available in the demo.');
    const vapid = await loadVapid(c.env);
    if (!vapid) throw new ApiError('not_found', 'Browser notifications are not available.');
    return c.json({ publicKey: vapid.publicKey });
  })
  .post('/push/web', async (c) => {
    const session = c.get('session');
    if (session.demo || !session.userId) throw new ApiError('forbidden', 'Not available in the demo.');
    if (!(await loadVapid(c.env))) throw new ApiError('not_found', 'Browser notifications are not available.');
    const input = await parseBody(c, WebPushSubscription);
    try {
      const point = fromBase64url(input.keys.p256dh);
      if (point.length !== 65 || point[0] !== 4 || fromBase64url(input.keys.auth).length !== 16) throw new Error('bad key');
    } catch {
      throw new ApiError('validation_failed', 'The request is not valid.');
    }
    const db = requireBinding(c.env, 'DB');
    const now = c.get('deps').now().toISOString();
    // The browser keeps one endpoint per origin. Signing in as someone else on it replaces the old row.
    await db.batch([
      db.prepare('DELETE FROM web_push_subscriptions WHERE endpoint=? AND NOT (user_id=? AND device_id=?)')
        .bind(input.endpoint, session.userId, input.deviceId),
      db.prepare(`
        INSERT INTO web_push_subscriptions(user_id,device_id,endpoint,p256dh,auth,session_hash,updated_at)
        SELECT ?,?,?,?,?,?,? WHERE (SELECT count(*) FROM web_push_subscriptions WHERE user_id=?) < 5
          OR EXISTS(SELECT 1 FROM web_push_subscriptions WHERE user_id=? AND device_id=?)
        ON CONFLICT(user_id,device_id) DO UPDATE SET endpoint=excluded.endpoint,p256dh=excluded.p256dh,
          auth=excluded.auth,session_hash=excluded.session_hash,updated_at=excluded.updated_at
      `).bind(session.userId, input.deviceId, input.endpoint, input.keys.p256dh, input.keys.auth, session.tokenHash, now,
        session.userId, session.userId, input.deviceId),
    ]);
    // The insert is skipped when the per-user cap is reached; confirm it landed.
    const stored = await db.prepare('SELECT 1 AS ok FROM web_push_subscriptions WHERE user_id=? AND device_id=? AND endpoint=?')
      .bind(session.userId, input.deviceId, input.endpoint).first();
    if (!stored) throw new ApiError('forbidden', 'Remove an unused browser before registering another one.');
    return c.json({ registered: true }, 201);
  })
  .delete('/push/web', async (c) => {
    const session = c.get('session');
    if (session.demo || !session.userId) throw new ApiError('forbidden', 'Not available in the demo.');
    const input = await parseBody(c, PushTokenRemoval);
    await requireBinding(c.env, 'DB').prepare('DELETE FROM web_push_subscriptions WHERE user_id=? AND device_id=?')
      .bind(session.userId, input.deviceId).run();
    return c.body(null, 204);
  });
