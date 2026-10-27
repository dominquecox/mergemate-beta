import { PushTokenRegistration, PushTokenRemoval } from '@mergemate/contracts';
import { Hono } from 'hono';
import { requireBinding } from '../config';
import type { AppEnv } from '../env';
import { ApiError } from '../errors';
import { parseBody } from '../lib/validate';

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
  });
