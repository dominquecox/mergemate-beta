import { describe, expect, it } from 'vitest';
import { createSession } from '../src/lib/sessions';
import { inQuietHours } from '../src/lib/settings';
import { checkPushReceipts, sendPushNotification } from '../src/lib/push';
import { defaultSettings } from '../src/lib/settings';
import { json, testContext, type TestContext } from './helpers';
import { appFor, ghUser, post, signIn } from './sign-in';

const token = (n: number) => `ExpoPushToken[fixture_device_${n}]`;
const device = (n: number) => `device_${String(n).padStart(4, '0')}`;
const settings = (overrides: Partial<ReturnType<typeof defaultSettings>> = {}) => ({ ...defaultSettings(), ...overrides });
const notice = (userId: string) => ({ userId, kind: 'review' as const, notificationId: 'notification_123' });
const expoCalls = (ctx: TestContext) => ctx.net.calls.filter((call) => call.url.startsWith('https://exp.host/'));

async function registered(n = 1) {
  const ctx = testContext({ EXPO_ACCESS_TOKEN: 'fixture-expo-access-not-real' });
  const session = await signIn(ctx);
  const call = appFor(ctx);
  for (let i = 0; i < n; i++) {
    expect((await call('/v1/push/tokens', post({ deviceId: device(i), token: token(i) }, session.headers))).status).toBe(201);
  }
  return { ctx, session, call };
}

describe('settings', () => {
  it('persists complete settings per user and does not leak another user preferences', async () => {
    const ctx = testContext(); const a = await signIn(ctx); const call = appFor(ctx);
    const value = settings({ aiSummaries: false, notifications: { review: false, mention: true, mine: false }, quietHours: { start: '22:00', end: '07:00', timeZone: 'America/Indiana/Indianapolis' } });
    expect((await call('/v1/settings', { ...post(value, a.headers), method: 'PUT' })).status).toBe(200);
    const aRead = await call('/v1/settings', { headers: a.headers });
    expect(await aRead.json()).toEqual(value); expect(aRead.headers.get('cache-control')).toBe('no-store');
    const b = await signIn(ctx, 'ios', { ...ghUser, id: 4243, login: 'another-user' });
    expect(await (await call('/v1/settings', { headers: b.headers })).json()).toEqual(defaultSettings());
  });

  it('validates zones, times and unknown fields; cookie writes need CSRF', async () => {
    const ctx = testContext(); const web = await signIn(ctx, 'web'); const call = appFor(ctx);
    const headers = { ...web.headers, origin: 'http://localhost:8081', 'x-csrf-token': web.csrf ?? '' };
    expect((await call('/v1/settings', { ...post(settings(), web.headers), method: 'PUT' })).status).toBe(403);
    for (const bad of [
      { start: '25:00', end: '07:00', timeZone: 'UTC' },
      { start: '22:00', end: '07:00', timeZone: 'Not/AZone' },
      { start: '22:00', end: '22:00', timeZone: 'UTC' },
    ]) expect((await call('/v1/settings', { ...post(settings({ quietHours: bad }), headers), method: 'PUT' })).status).toBe(422);
    expect((await call('/v1/settings', { ...post({ ...settings(), userId: 'other' }, headers), method: 'PUT' })).status).toBe(422);
    expect((await call('/v1/settings', { ...post(settings(), headers), method: 'PUT' })).status).toBe(200);
  });

  it('serves fixture settings in demo but rejects all settings and token writes', async () => {
    const ctx = testContext(); const issued = await createSession(ctx.env.DB, { userId: null, transport: 'bearer', now: ctx.time.now() });
    const headers = { authorization: `Bearer ${issued.token}` }; const call = appFor(ctx);
    expect((await call('/v1/settings', { headers })).status).toBe(200);
    expect((await call('/v1/settings', { ...post(settings(), headers), method: 'PUT' })).status).toBe(403);
    expect((await call('/v1/push/tokens', post({ deviceId: device(0), token: token(0) }, headers))).status).toBe(403);
    expect((await call('/v1/push/tokens', { ...post({ deviceId: device(0) }, headers), method: 'DELETE' })).status).toBe(403);
    expect(ctx.db.rows('SELECT * FROM push_tokens')).toEqual([]);
  });
});

describe('quiet hours', () => {
  it('handles overnight windows and start-inclusive/end-exclusive boundaries', () => {
    const quiet = { start: '22:00', end: '07:00', timeZone: 'UTC' };
    for (const [time, result] of [['21:59', false], ['22:00', true], ['06:59', true], ['07:00', false]] as const) {
      expect(inQuietHours(quiet, new Date(`2026-10-27T${time}:00Z`))).toBe(result);
    }
    expect(inQuietHours(null, new Date())).toBe(false);
  });

  it('handles repeated/skipped DST times and non-whole-hour zones', () => {
    const quiet = { start: '01:30', end: '02:30', timeZone: 'America/New_York' };
    expect(inQuietHours(quiet, new Date('2026-03-08T06:45:00Z'))).toBe(true);
    expect(inQuietHours(quiet, new Date('2026-03-08T07:15:00Z'))).toBe(false);
    expect(inQuietHours(quiet, new Date('2026-11-01T05:45:00Z'))).toBe(true);
    expect(inQuietHours(quiet, new Date('2026-11-01T06:45:00Z'))).toBe(true);
    expect(inQuietHours(quiet, new Date('2026-11-01T07:30:00Z'))).toBe(false);
    expect(inQuietHours({ start: '17:30', end: '18:00', timeZone: 'Asia/Kathmandu' }, new Date('2026-10-27T12:00:00Z'))).toBe(true);
  });
});

describe('device registration', () => {
  it('validates tokens and atomically caps registrations while permitting replacement', async () => {
    const { ctx, session, call } = await registered(0);
    expect((await call('/v1/push/tokens', post({ deviceId: device(0), token: 'invalid' }, session.headers))).status).toBe(422);
    const responses = await Promise.all(Array.from({ length: 11 }, (_, i) => call('/v1/push/tokens', post({ deviceId: device(i), token: token(i) }, session.headers))));
    expect(responses.filter((response) => response.status === 201)).toHaveLength(10);
    expect(ctx.db.rows('SELECT * FROM push_tokens')).toHaveLength(10);
    expect((await call('/v1/push/tokens', post({ deviceId: device(0), token: token(20) }, session.headers))).status).toBe(201);
    expect(ctx.db.rows('SELECT * FROM push_tokens')).toHaveLength(10);
  });

  it('prevents one user from taking another user token or deleting their registration', async () => {
    const { ctx, call } = await registered();
    const b = await signIn(ctx, 'ios', { ...ghUser, id: 4243, login: 'another-user' });
    expect((await call('/v1/push/tokens', post({ deviceId: device(0), token: token(0) }, b.headers))).status).toBe(403);
    expect((await call('/v1/push/tokens', { ...post({ deviceId: device(0) }, b.headers), method: 'DELETE' })).status).toBe(204);
    expect(ctx.db.rows('SELECT * FROM push_tokens')).toHaveLength(1);
  });

  it('keeps devices through session rotation and removes the current session on logout', async () => {
    const { ctx, session, call } = await registered();
    const other = await signIn(ctx);
    await call('/v1/push/tokens', post({ deviceId: device(1), token: token(1) }, other.headers));
    const response = await call('/v1/auth/refresh', post({}, session.headers));
    const refreshed = await response.json() as { session: { token: string } };
    expect(ctx.db.rows('SELECT * FROM push_tokens')).toHaveLength(2);
    expect((await call('/v1/auth/logout', post({}, { authorization: `Bearer ${refreshed.session.token}` }))).status).toBe(204);
    expect(ctx.db.rows<{ device_id: string }>('SELECT device_id FROM push_tokens')).toEqual([{ device_id: device(1) }]);
  });

  it('removes settings, tokens and receipts when the account is deleted', async () => {
    const { ctx, session, call } = await registered();
    await call('/v1/settings', { ...post(settings(), session.headers), method: 'PUT' });
    ctx.net.on('POST', 'https://exp.host/--/api/v2/push/send', { data: [{ status: 'ok', id: 'fixture-receipt' }] });
    await sendPushNotification(ctx.env, ctx.deps, notice(session.userId));
    ctx.net.on('DELETE', 'https://api.github.com/applications/', () => new Response(null, { status: 204 }));
    expect((await call('/v1/account', { method: 'DELETE', headers: session.headers })).status).toBe(204);
    for (const table of ['user_settings', 'push_tokens', 'push_receipts']) expect(ctx.db.rows(`SELECT * FROM ${table}`)).toEqual([]);
  });
});

describe('Expo sender and receipts', () => {
  it('sends fixed text with push-security authentication and records acceptance for receipt checking', async () => {
    const { ctx, session } = await registered();
    ctx.net.on('POST', 'https://exp.host/--/api/v2/push/send', { data: [{ status: 'ok', id: 'fixture-receipt' }] });
    expect(await sendPushNotification(ctx.env, ctx.deps, notice(session.userId))).toMatchObject({ accepted: 1, suppressed: false });
    const call = expoCalls(ctx)[0]; expect(call?.headers.get('authorization')).toBe('Bearer fixture-expo-access-not-real');
    const body = JSON.parse(call?.body ?? '[]') as { body: string; title: string; data: unknown; expiration: number }[];
    expect(body[0]).toMatchObject({ title: 'MergeMate', body: 'A pull request needs your review.', data: { notificationId: 'notification_123' } });
    expect(body[0]?.expiration).toBe(Math.floor(ctx.time.now().getTime() / 60_000) * 60 + 60);
    expect(ctx.db.rows('SELECT * FROM push_receipts')).toHaveLength(1);
  });

  it('suppresses disabled kinds, quiet hours, suspended users and expired sessions without contacting Expo', async () => {
    const { ctx, session, call } = await registered();
    const set = async (value: ReturnType<typeof defaultSettings>) => call('/v1/settings', { ...post(value, session.headers), method: 'PUT' });
    await set(settings({ notifications: { review: false, mention: true, mine: true } }));
    expect((await sendPushNotification(ctx.env, ctx.deps, notice(session.userId))).suppressed).toBe(true);
    await set(settings({ quietHours: { start: '11:00', end: '13:00', timeZone: 'UTC' } }));
    expect((await sendPushNotification(ctx.env, ctx.deps, notice(session.userId))).suppressed).toBe(true);
    await set(settings()); await ctx.db.prepare("UPDATE users SET status='suspended'").run();
    expect((await sendPushNotification(ctx.env, ctx.deps, notice(session.userId))).suppressed).toBe(true);
    await ctx.db.prepare("UPDATE users SET status='active'").run(); ctx.time.advance(8 * 24 * 60 * 60_000);
    expect((await sendPushNotification(ctx.env, ctx.deps, notice(session.userId))).accepted).toBe(0);
    expect(expoCalls(ctx)).toEqual([]);
  });

  it('requires the Expo access secret and does not expose the provider error body', async () => {
    const { ctx, session } = await registered(); delete ctx.env.EXPO_ACCESS_TOKEN;
    await expect(sendPushNotification(ctx.env, ctx.deps, notice(session.userId))).rejects.toMatchObject({ code: 'misconfigured' });
    expect(expoCalls(ctx)).toEqual([]);
    ctx.env.EXPO_ACCESS_TOKEN = 'fixture-expo-access-not-real';
    ctx.net.on('POST', 'https://exp.host/--/api/v2/push/send', () => new Response('private provider detail', { status: 401 }));
    await expect(sendPushNotification(ctx.env, ctx.deps, notice(session.userId))).rejects.toMatchObject({ message: 'The push service rejected the request.' });
  });

  it('rechecks quiet hours before retrying an explicit service failure', async () => {
    const { ctx, session, call } = await registered();
    await call('/v1/settings', { ...post(settings({ quietHours: { start: '22:00', end: '07:00', timeZone: 'UTC' } }), session.headers), method: 'PUT' });
    ctx.time.advance(Date.parse('2026-10-27T21:59:59Z') - ctx.time.now().getTime());
    ctx.net.on('POST', 'https://exp.host/--/api/v2/push/send', () => { ctx.time.advance(2000); return json({}, 429); });
    expect((await sendPushNotification(ctx.env, ctx.deps, notice(session.userId))).suppressed).toBe(true);
    expect(expoCalls(ctx)).toHaveLength(1);
  });

  it('removes unregistered tokens from tickets and later receipts', async () => {
    const { ctx, session } = await registered(2);
    ctx.net.on('POST', 'https://exp.host/--/api/v2/push/send', { data: [{ status: 'error', details: { error: 'DeviceNotRegistered' } }, { status: 'ok', id: 'fixture-receipt' }] });
    expect(await sendPushNotification(ctx.env, ctx.deps, notice(session.userId))).toMatchObject({ accepted: 1, removed: 1 });
    ctx.time.advance(15 * 60_000);
    ctx.net.on('POST', 'https://exp.host/--/api/v2/push/getReceipts', { data: { 'fixture-receipt': { status: 'error', details: { error: 'DeviceNotRegistered' } } } });
    expect(await checkPushReceipts(ctx.env, ctx.deps)).toMatchObject({ checked: 1 });
    expect(ctx.db.rows('SELECT * FROM push_tokens')).toEqual([]); expect(ctx.db.rows('SELECT * FROM push_receipts')).toEqual([]);
  });

  it('protects a replacement token from a stale receipt for the old token', async () => {
    const { ctx, session, call } = await registered();
    ctx.net.on('POST', 'https://exp.host/--/api/v2/push/send', { data: [{ status: 'ok', id: 'fixture-receipt' }] });
    await sendPushNotification(ctx.env, ctx.deps, notice(session.userId));
    await call('/v1/push/tokens', post({ deviceId: device(0), token: token(20) }, session.headers));
    ctx.time.advance(15 * 60_000);
    ctx.net.on('POST', 'https://exp.host/--/api/v2/push/getReceipts', { data: { 'fixture-receipt': { status: 'error', details: { error: 'DeviceNotRegistered' } } } });
    await checkPushReceipts(ctx.env, ctx.deps);
    expect(ctx.db.rows<{ token: string }>('SELECT token FROM push_tokens')).toEqual([{ token: token(20) }]);
  });
});
