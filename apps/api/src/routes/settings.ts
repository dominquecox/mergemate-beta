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
    const submitted = await parseBody(c, Settings);
    const db = requireBinding(c.env, 'DB');
    // AI summaries and risk is an AI choice: it changes only through /consent/preferences, which fences pending AI work.
    // A full-object save from a stale screen must never flip it back.
    const stored = (await getSettings(c.env, session.userId)).aiSummaries;
    const value = { ...submitted, aiSummaries: stored };
    await db.prepare(
      "INSERT INTO user_settings(user_id,settings,updated_at) VALUES(?1,?2,?3) ON CONFLICT(user_id) DO UPDATE SET settings=json_set(excluded.settings,'$.aiSummaries',json(CASE WHEN json_extract(user_settings.settings,'$.aiSummaries') IN (0,false) THEN 'false' ELSE 'true' END)),updated_at=excluded.updated_at",
    ).bind(session.userId, JSON.stringify(value), c.get('deps').now().toISOString()).run();
    return c.json(await getSettings(c.env, session.userId));
  });
