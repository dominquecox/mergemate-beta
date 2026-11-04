import { ErrorBody } from '@mergemate/contracts';
import { describe, expect, it } from 'vitest';
import type { AiBinding } from '../src/env';
import { ApiError } from '../src/errors';
import { readAiPreferences } from '../src/lib/ai-policy';
import { summarizePr, storesFor } from '../src/routes/ai-engine';
import type { PrData } from '../src/routes/ai-engine';
import { createDbConsentStore } from '../src/routes/consent';
import type { SessionRecord } from '../src/lib/sessions';
import { demoHeaders } from './demo-session';
import { putPrefs, readPrefs, setSummaries } from './ai-choices';
import { TestD1 } from './d1';
import { mockTransport, testContext, validModelEnv } from './helpers';
import { appFor, signIn } from './sign-in';

const summaryText = JSON.stringify({ whatChanged: 'x', whyItMatters: 'y', suggestedFocus: [] });
const ref = { owner: 'o', repo: 'r', number: 1 };
const session: SessionRecord = {
  tokenHash: 'h', userId: 'u1', demo: false, transport: 'bearer', csrfToken: null,
  expiresAt: '2026-11-26T12:00:00.000Z', userStatus: 'active',
};
const prData = (): PrData => ({
  title: 't', description: 'd', headSha: 'abc', files: [{ path: 'a.ts', patch: 'run();', additions: 1, deletions: 0 }],
  authorIsBot: false, coAuthoredByBot: false, hasTests: true, checksFailing: false,
});

const setup = async (during?: (db: D1Database) => Promise<void>, reply = summaryText) => {
  const db = new TestD1() as unknown as D1Database;
  await db.prepare(`INSERT INTO users (id, github_id, login, name, avatar_url, status, created_at, updated_at) VALUES ('u1', 4242, 'u', 'U', 'https://example.com/a.png', 'active', '2026-10-26T00:00:00Z', '2026-10-26T00:00:00Z')`).run();
  await createDbConsentStore(db).write('u1', true);
  const transport = mockTransport(async () => {
    await during?.(db);
    return { text: reply };
  });
  const deps = { db, transport, ai: undefined as AiBinding | undefined, prSource: async () => prData(), limits: { free: 30, pro: 500, global: undefined as number | undefined } };
  const sql = (q: string, ...b: unknown[]) => (db as unknown as TestD1).rows<Record<string, unknown>>(q, ...(b as never[]));
  return { db, deps, transport, sql };
};
const failure = async (run: () => Promise<unknown>): Promise<ApiError> => {
  try { await run(); } catch (e) { if (e instanceof ApiError) return e; throw e; }
  throw new Error('expected an ApiError');
};
const revoke = (db: D1Database) => createDbConsentStore(db).write('u1', false);
const setSummariesOff = (db: D1Database) =>
  db.prepare(`UPDATE user_settings SET settings=json_set(settings,'$.aiSummaries',json('false')) WHERE user_id='u1'`).run();

describe('revocation during pending AI work', () => {
  it('revoking while the model runs blocks delivery, the cache write and the charge', async () => {
    const { deps, transport, sql, db } = await setup(async (d) => { await revoke(d); });
    const error = await failure(() => summarizePr(deps, session, ref, validModelEnv()));
    expect(error.code).toBe('consent_required');
    expect(transport.calls).toHaveLength(1);
    expect(sql('SELECT 1 FROM ai_results_cache')).toEqual([]);
    expect(sql("SELECT used FROM ai_usage_daily WHERE scope='u1'").every((r) => r.used === 0)).toBe(true);
    expect((await readAiPreferences(db, 'u1')).ai.granted).toBe(false);
  });

  it('revoking before dispatch means the model is never called', async () => {
    const { deps, transport, sql } = await setup();
    const prSource = deps.prSource;
    deps.prSource = async () => { await revoke(deps.db); return prSource(); };
    const error = await failure(() => summarizePr(deps, session, ref, validModelEnv()));
    expect(error.code).toBe('consent_required');
    expect(transport.calls).toHaveLength(0);
    expect(sql('SELECT 1 FROM ai_results_cache')).toEqual([]);
  });

  it('turning summaries off while the model runs blocks delivery and caching', async () => {
    const { deps, sql, db } = await setup(async (d) => { await setSummariesOff(d); });
    await db.prepare(`INSERT INTO user_settings(user_id,settings,updated_at) VALUES ('u1', '{"notifications":{"review":true,"mention":true,"mine":true},"quietHours":null,"aiSummaries":true}', '2026-10-26T00:00:00Z')`).run();
    const error = await failure(() => summarizePr(deps, session, ref, validModelEnv()));
    expect(error.code).toBe('forbidden');
    expect(sql('SELECT 1 FROM ai_results_cache')).toEqual([]);
  });

  it('a revoke and re-grant during the call is a new policy: the old result is not delivered or cached', async () => {
    const { deps, sql } = await setup(async (d) => { await revoke(d); await createDbConsentStore(d).write('u1', true); });
    const error = await failure(() => summarizePr(deps, session, ref, validModelEnv()));
    expect(error.code).toBe('consent_changed');
    expect(sql('SELECT 1 FROM ai_results_cache')).toEqual([]);
  });

  it('a result cached under an earlier policy is dropped and never served after a re-grant', async () => {
    const { deps, transport, sql, db } = await setup();
    await summarizePr(deps, session, ref, validModelEnv());
    expect(sql('SELECT 1 FROM ai_results_cache')).toHaveLength(1);
    await revoke(db);
    expect(sql('SELECT 1 FROM ai_results_cache')).toEqual([]);
    await createDbConsentStore(db).write('u1', true);
    await summarizePr(deps, session, ref, validModelEnv());
    expect(transport.calls).toHaveLength(2);
  });

  it('a stale cache write cannot repopulate results once the policy moved on', async () => {
    const { db, sql } = await setup();
    const stores = storesFor(db);
    const stale = (await readAiPreferences(db, 'u1')).revision;
    await revoke(db);
    await createDbConsentStore(db).write('u1', true);
    await db.prepare('INSERT INTO ai_results_cache(key,user_id,body,created_at,policy_revision) VALUES (?,?,?,?,?)').bind('k', 'u1', '{}', 'now', stale).run();
    expect(sql('SELECT 1 FROM ai_results_cache')).toEqual([]);
    await expect(stores.cache.get('k')).resolves.toBeUndefined();
  });
});

describe('AI choices API', () => {
  const start = async () => {
    const ctx = testContext(validModelEnv());
    const { headers } = await signIn(ctx);
    return { ctx, headers, call: appFor(ctx) };
  };

  it('starts with AI off, summaries on and a revision', async () => {
    const { call, headers } = await start();
    const prefs = await readPrefs(call, headers);
    expect(prefs.ai).toMatchObject({ granted: false, currentVersion: '2' });
    expect(prefs.aiSummaries).toBe(true);
    expect(prefs.revision.length).toBeGreaterThan(0);
  });

  it('grant needs the current consent version and the latest revision', async () => {
    const { call, headers } = await start();
    const old = await readPrefs(call, headers);
    const wrongVersion = await putPrefs(call, headers, { action: 'grant', version: '0' });
    expect(wrongVersion.status).toBe(403);
    expect(ErrorBody.parse(await wrongVersion.json()).error.code).toBe('consent_required');
    expect((await putPrefs(call, headers, { action: 'grant', version: '2' })).status).toBe(200);
    const granted = await readPrefs(call, headers);
    expect(granted.ai.granted).toBe(true);
    expect(granted.revision).not.toBe(old.revision);
    // A screen still holding the old revision cannot overwrite what changed since.
    const stale = await putPrefs(call, headers, { action: 'summaries', enabled: false }, old.revision);
    expect(stale.status).toBe(409);
    expect(ErrorBody.parse(await stale.json()).error.code).toBe('consent_changed');
    expect(await readPrefs(call, headers)).toEqual(granted);
  });

  it('only one of two writers holding the same revision wins', async () => {
    const { call, headers } = await start();
    const { revision } = await readPrefs(call, headers);
    const [a, b] = await Promise.all([
      putPrefs(call, headers, { action: 'grant', version: '2' }, revision),
      putPrefs(call, headers, { action: 'grant', version: '2' }, revision),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
  });

  it('revoke always works and also stops summaries; revoking twice is safe', async () => {
    const { call, headers } = await start();
    await putPrefs(call, headers, { action: 'grant', version: '2' });
    const before = await readPrefs(call, headers);
    expect((await putPrefs(call, headers, { action: 'revoke' })).status).toBe(200);
    const after = await readPrefs(call, headers);
    expect(after).toMatchObject({ ai: { granted: false }, aiSummaries: false });
    expect(after.revision).not.toBe(before.revision);
    expect((await putPrefs(call, headers, { action: 'revoke' })).status).toBe(200);
  });

  it('summaries are independent of consent, cannot be enabled without it, and survive a settings save', async () => {
    const { call, headers } = await start();
    expect((await setSummaries(call, headers, false)).status).toBe(200);
    const off = await call('/v1/consent/preferences', { headers });
    expect((await off.json() as { aiSummaries: boolean }).aiSummaries).toBe(false);
    const early = await setSummaries(call, headers, true);
    expect(early.status).toBe(403);
    await putPrefs(call, headers, { action: 'grant', version: '2' });
    expect((await readPrefs(call, headers)).aiSummaries).toBe(true);
    expect((await setSummaries(call, headers, false)).status).toBe(200);
    expect(await readPrefs(call, headers)).toMatchObject({ ai: { granted: true }, aiSummaries: false });
  });

  it('rejects unknown fields and bad bodies', async () => {
    const { call, headers } = await start();
    expect((await putPrefs(call, headers, { action: 'revoke', extra: 1 })).status).toBe(422);
    expect((await putPrefs(call, headers, { action: 'summaries' })).status).toBe(422);
  });

  it('the demo reads fixed sample state and cannot change anything', async () => {
    const ctx = testContext(validModelEnv());
    const headers = await demoHeaders(ctx);
    const call = appFor(ctx);
    expect((await call('/v1/consent/preferences', { headers })).status).toBe(200);
    expect((await putPrefs(call, headers, { action: 'revoke' })).status).toBe(403);
  });

  it('accounts never see each other\'s choices', async () => {
    const ctx = testContext(validModelEnv());
    const a = await signIn(ctx);
    const b = await signIn(ctx, 'ios', { id: 9, login: 'other', name: null, avatar_url: 'https://avatars.githubusercontent.com/u/9' });
    const call = appFor(ctx);
    await putPrefs(call, a.headers, { action: 'grant', version: '2' });
    expect((await readPrefs(call, b.headers)).ai.granted).toBe(false);
  });
});
