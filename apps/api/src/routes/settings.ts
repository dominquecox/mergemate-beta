import { Settings } from '@mergemate/contracts';
import { Hono } from 'hono';
import { requireBinding } from '../config';
import type { AppEnv } from '../env';
import { ApiError } from '../errors';
import { demoSettings, getSettings } from '../lib/settings';
import { parseBody } from '../lib/validate';

export const settings = new Hono<AppEnv>()
  .get('/settings', async (c) => {
    const session = c.get('session');
    if (session.demo) return c.json(demoSettings());
    if (!session.userId) throw new ApiError('unauthorized', 'Sign in to continue.');
    return c.json(await getSettings(c.env, session.userId));
  })
  .put('/settings', async (c) => {
    const session = c.get('session');
    if (session.demo || !session.userId) throw new ApiError('forbidden', 'Not available in the demo.');
    const value = await parseBody(c, Settings);
    await requireBinding(c.env, 'DB').prepare(
      'INSERT INTO user_settings(user_id,settings,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET settings=excluded.settings,updated_at=excluded.updated_at',
    ).bind(session.userId, JSON.stringify(value), c.get('deps').now().toISOString()).run();
    return c.json(value);
  });
