import { describe, expect, it, vi } from 'vitest';
import { isWebPushEndpoint } from '@mergemate/contracts';
import { base64url } from '../src/lib/crypto';
import { type GitHubEventMessage } from '../src/lib/github-webhooks';
import { sendPushNotification } from '../src/lib/push';
import { defaultSettings } from '../src/lib/settings';
import { handleQueue } from '../src/queues';
import { json, testContext, type RecordedCall, type TestContext } from './helpers';
import { appFor, post, signIn } from './sign-in';

const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/fixture-endpoint-1';
const device = (n: number) => `browser_${String(n).padStart(4, '0')}`;
const target = { repo: 'acme/api', number: 7, title: 'Fix the cache' };
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** A browser: its own subscription keys, and the receiving side of RFC 8291 to read what the server sent. */
async function browser() {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const publicRaw = new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer);
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const hkdf = async (salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number) =>
    new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info },
      await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']), bytes * 8));
  return {
    keys: { p256dh: base64url(publicRaw), auth: base64url(auth) },
    async open(bytes: Uint8Array | undefined): Promise<unknown> {
      if (!bytes) throw new Error('no binary body');
      const salt = bytes.slice(0, 16);
      expect(new DataView(bytes.buffer).getUint32(16, false)).toBe(4096);
      const idLength = bytes[20] ?? 0;
      const senderPublic = bytes.slice(21, 21 + idLength);
      const sender = await crypto.subtle.importKey('raw', senderPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
      const algorithm = { name: 'ECDH', public: sender } as unknown as SubtleCryptoDeriveKeyAlgorithm;
      const shared = new Uint8Array(await crypto.subtle.deriveBits(algorithm, pair.privateKey, 256));
      const ikm = await hkdf(auth, shared, new Uint8Array([...encoder.encode('WebPush: info\0'), ...publicRaw, ...senderPublic]), 32);
      const cek = await hkdf(salt, ikm, encoder.encode('Content-Encoding: aes128gcm\0'), 16);
      const nonce = await hkdf(salt, ikm, encoder.encode('Content-Encoding: nonce\0'), 12);
      const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
      const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, bytes.slice(21 + senderPublic.length)));
      expect(plain.at(-1)).toBe(2);
      return JSON.parse(decoder.decode(plain.slice(0, -1)));
    },
  };
}

async function vapidEnv() {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey('jwk', pair.privateKey)) as JsonWebKey;
  return {
    VAPID_PUBLIC_KEY: base64url(new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer)),
    VAPID_PRIVATE_KEY: String(jwk.d),
  };
}

async function ready(n = 1) {
  const ctx = testContext(await vapidEnv());
  const session = await signIn(ctx);
  const call = appFor(ctx);
  const browsers = [];
  for (let i = 0; i < n; i++) {
    const b = await browser();
    browsers.push(b);
    const res = await call('/v1/push/web', post({ deviceId: device(i), endpoint: `${ENDPOINT.slice(0, -1)}${i}`, keys: b.keys }, session.headers));
    expect(res.status).toBe(201);
  }
  return { ctx, session, call, browsers };
}
const webCalls = (ctx: TestContext) => ctx.net.calls.filter((c) => c.url.startsWith('https://fcm.googleapis.com/'));
const notice = (userId: string, extra = {}) => ({ userId, kind: 'review' as const, notificationId: 'notification_123', target, ...extra });

describe('web push endpoint allowlist', () => {
  it('accepts only https push services of the supported browsers', () => {
    for (const ok of ['https://fcm.googleapis.com/fcm/send/abc', 'https://updates.push.services.mozilla.com/wpush/v2/abc',
      'https://web.push.apple.com/abc', 'https://wns2-par02p.notify.windows.com/w/?token=abc', 'https://api.push.apple.com/3/device/abc']) {
      expect(isWebPushEndpoint(ok), ok).toBe(true);
    }
    for (const bad of ['http://fcm.googleapis.com/fcm/send/abc', 'https://evil.example/fcm/send/abc', 'https://fcm.googleapis.com.evil.example/x',
      'https://user:pw@fcm.googleapis.com/x', 'https://fcm.googleapis.com:8443/x', 'https://127.0.0.1/x', 'https://169.254.169.254/latest', 'not a url',
      'https://notify.windows.com.evil.example/x']) {
      expect(isWebPushEndpoint(bad), bad).toBe(false);
    }
  });
});

describe('browser subscription routes', () => {
  it('serves the public key only when the pair is configured, and not in the demo', async () => {
    const off = testContext(); const offSession = await signIn(off);
    expect((await appFor(off)('/v1/push/web-key', { headers: offSession.headers })).status).toBe(404);
    expect((await appFor(off)('/v1/push/web', post({ deviceId: device(0), endpoint: ENDPOINT, keys: (await browser()).keys }, offSession.headers))).status).toBe(404);
    const { ctx, session, call } = await ready(0);
    const res = await call('/v1/push/web-key', { headers: session.headers });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ publicKey: ctx.env.VAPID_PUBLIC_KEY });
    expect(JSON.stringify(await (await call('/v1/push/web-key', { headers: session.headers })).json())).not.toContain(String(ctx.env.VAPID_PRIVATE_KEY));
    expect((await call('/v1/push/web-key')).status).toBe(401);
  });

  it('validates the endpoint and keys, and caps registrations while allowing replacement', async () => {
    const { ctx, session, call } = await ready(0);
    const b = await browser();
    const send = (body: unknown) => call('/v1/push/web', post(body, session.headers));
    expect((await send({ deviceId: device(0), endpoint: 'https://evil.example/x', keys: b.keys })).status).toBe(422);
    expect((await send({ deviceId: device(0), endpoint: ENDPOINT, keys: { ...b.keys, auth: 'short' } })).status).toBe(422);
    // 87 characters that decode to the wrong point are refused as well.
    expect((await send({ deviceId: device(0), endpoint: ENDPOINT, keys: { ...b.keys, p256dh: 'A'.repeat(87) } })).status).toBe(422);
    expect((await send({ deviceId: device(0), endpoint: ENDPOINT, keys: b.keys, extra: 1 })).status).toBe(422);
    for (let i = 0; i < 5; i++) expect((await send({ deviceId: device(i), endpoint: `${ENDPOINT}${i}`, keys: b.keys })).status).toBe(201);
    expect((await send({ deviceId: device(5), endpoint: `${ENDPOINT}5`, keys: b.keys })).status).toBe(403);
    expect((await send({ deviceId: device(0), endpoint: `${ENDPOINT}new`, keys: b.keys })).status).toBe(201);
    expect(ctx.db.rows('SELECT * FROM web_push_subscriptions')).toHaveLength(5);
  });

  it('moves an endpoint to whoever signs in on that browser and lets a user remove their own only', async () => {
    const { ctx, session, call } = await ready(1);
    const b = await signIn(ctx, 'ios', { id: 4243, login: 'another-user', name: null, avatar_url: 'https://avatars.githubusercontent.com/u/4243' });
    const keys = (await browser()).keys;
    expect((await call('/v1/push/web', post({ deviceId: device(9), endpoint: `${ENDPOINT.slice(0, -1)}0`, keys }, b.headers))).status).toBe(201);
    expect(ctx.db.rows<{ user_id: string }>('SELECT user_id FROM web_push_subscriptions')).toEqual([{ user_id: b.userId }]);
    expect((await call('/v1/push/web', { ...post({ deviceId: device(9) }, session.headers), method: 'DELETE' })).status).toBe(204);
    expect(ctx.db.rows('SELECT * FROM web_push_subscriptions')).toHaveLength(1);
    expect((await call('/v1/push/web', { ...post({ deviceId: device(9) }, b.headers), method: 'DELETE' })).status).toBe(204);
    expect(ctx.db.rows('SELECT * FROM web_push_subscriptions')).toEqual([]);
  });

  it('requires CSRF for cookie sessions and refuses the demo', async () => {
    const ctx = testContext(await vapidEnv()); const web = await signIn(ctx, 'web'); const call = appFor(ctx);
    const body = { deviceId: device(0), endpoint: ENDPOINT, keys: (await browser()).keys };
    expect((await call('/v1/push/web', post(body, web.headers))).status).toBe(403);
    const headers = { ...web.headers, origin: 'http://localhost:8081', 'x-csrf-token': web.csrf ?? '' };
    expect((await call('/v1/push/web', post(body, headers))).status).toBe(201);
    const { createSession } = await import('../src/lib/sessions');
    const demo = await createSession(ctx.env.DB, { userId: null, transport: 'bearer', now: ctx.time.now() });
    const demoHeaders = { authorization: `Bearer ${demo.token}` };
    expect((await call('/v1/push/web-key', { headers: demoHeaders })).status).toBe(403);
    expect((await call('/v1/push/web', post(body, demoHeaders))).status).toBe(403);
  });

  it('survives session rotation and is removed on logout', async () => {
    const { ctx, session, call } = await ready(1);
    const refreshed = await (await call('/v1/auth/refresh', post({}, session.headers))).json() as { session: { token: string } };
    expect(ctx.db.rows('SELECT * FROM web_push_subscriptions')).toHaveLength(1);
    expect((await call('/v1/auth/logout', post({}, { authorization: `Bearer ${refreshed.session.token}` }))).status).toBe(204);
    expect(ctx.db.rows('SELECT * FROM web_push_subscriptions')).toEqual([]);
  });

  it('is removed when the account is deleted', async () => {
    const { ctx, session, call } = await ready(1);
    ctx.net.on('DELETE', 'https://api.github.com/applications/', () => new Response(null, { status: 204 }));
    expect((await call('/v1/account', { method: 'DELETE', headers: session.headers })).status).toBe(204);
    expect(ctx.db.rows('SELECT * FROM web_push_subscriptions')).toEqual([]);
  });
});

describe('browser sender', () => {
  it('sends one encrypted message with VAPID that only the browser can read, carrying repo#number and title', async () => {
    const { ctx, session, browsers } = await ready();
    ctx.net.on('POST', 'https://fcm.googleapis.com/', () => new Response(null, { status: 201 }));
    expect(await sendPushNotification(ctx.env, ctx.deps, notice(session.userId))).toEqual({ accepted: 1, removed: 0, failed: 0, suppressed: false });
    const call = webCalls(ctx)[0];
    expect(call?.url).toBe(`${ENDPOINT.slice(0, -1)}0`);
    expect(call?.headers.get('content-encoding')).toBe('aes128gcm');
    expect(call?.headers.get('ttl')).toBe('60');
    expect(call?.headers.get('authorization')).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=/);
    expect(decoder.decode(call?.bytes)).not.toContain('acme');
    expect(await browsers[0]?.open(call?.bytes)).toEqual({ v: 1, kind: 'review', repo: 'acme/api', number: 7, title: 'Fix the cache' });
  });

  it('cleans control characters and long titles, and sends nothing without a target', async () => {
    const { ctx, session, browsers } = await ready();
    ctx.net.on('POST', 'https://fcm.googleapis.com/', () => new Response(null, { status: 201 }));
    await sendPushNotification(ctx.env, ctx.deps, notice(session.userId, { target: { ...target, title: `Line\none\u0000\t${'x'.repeat(300)}` } }));
    const opened = await browsers[0]?.open(webCalls(ctx)[0]?.bytes) as { title: string };
    expect(opened.title).toMatch(/^Line one x+…$/);
    expect(opened.title.length).toBe(140);
    const before = webCalls(ctx).length;
    await sendPushNotification(ctx.env, ctx.deps, { userId: session.userId, kind: 'review', notificationId: 'notification_123' });
    await sendPushNotification(ctx.env, ctx.deps, notice(session.userId, { target: { repo: '../x', number: 7, title: 't' } }));
    expect(webCalls(ctx)).toHaveLength(before);
  });

  it('drops a subscription the push service reports gone, and counts other failures without removing', async () => {
    const { ctx, session } = await ready(3);
    const status = new Map([['0', 410], ['1', 404], ['2', 503]]);
    ctx.net.on('POST', 'https://fcm.googleapis.com/', (c: RecordedCall) => new Response(null, { status: status.get(c.url.slice(-1)) ?? 201 }));
    expect(await sendPushNotification(ctx.env, ctx.deps, notice(session.userId))).toEqual({ accepted: 0, removed: 2, failed: 1, suppressed: false });
    expect(ctx.db.rows<{ device_id: string }>('SELECT device_id FROM web_push_subscriptions')).toEqual([{ device_id: device(2) }]);
  });

  it('follows the same preferences as Expo: kinds, quiet hours, suspended users, expired sessions', async () => {
    const { ctx, session, call } = await ready();
    ctx.net.on('POST', 'https://fcm.googleapis.com/', () => new Response(null, { status: 201 }));
    const set = (value: ReturnType<typeof defaultSettings>) => call('/v1/settings', { ...post(value, session.headers), method: 'PUT' });
    await set({ ...defaultSettings(), notifications: { review: false, mention: true, mine: true } });
    expect((await sendPushNotification(ctx.env, ctx.deps, notice(session.userId))).suppressed).toBe(true);
    await set({ ...defaultSettings(), quietHours: { start: '11:00', end: '13:00', timeZone: 'UTC' } });
    expect((await sendPushNotification(ctx.env, ctx.deps, notice(session.userId))).suppressed).toBe(true);
    await set(defaultSettings());
    await ctx.db.prepare("UPDATE users SET status='suspended'").run();
    expect((await sendPushNotification(ctx.env, ctx.deps, notice(session.userId))).suppressed).toBe(true);
    await ctx.db.prepare("UPDATE users SET status='active'").run();
    await ctx.db.prepare("UPDATE sessions SET expires_at='2000-01-01T00:00:00.000Z'").run();
    expect(await sendPushNotification(ctx.env, ctx.deps, notice(session.userId))).toMatchObject({ accepted: 0, suppressed: false });
    expect(webCalls(ctx)).toHaveLength(0);
  });

  it('does nothing without a configured pair, and works without any Expo credentials', async () => {
    const off = testContext(); const offSession = await signIn(off);
    await off.db.prepare('INSERT INTO web_push_subscriptions(user_id,device_id,endpoint,p256dh,auth,session_hash,updated_at) SELECT ?,?,?,?,?,token_hash,? FROM sessions')
      .bind(offSession.userId, device(0), ENDPOINT, 'x', 'y', '2026-10-27T12:00:00.000Z').run();
    expect(await sendPushNotification(off.env, off.deps, notice(offSession.userId))).toMatchObject({ accepted: 0 });
    expect(webCalls(off)).toHaveLength(0);
    // A user with both channels and no EXPO_ACCESS_TOKEN still gets the browser notification.
    const { ctx, session, call } = await ready();
    ctx.net.on('POST', 'https://fcm.googleapis.com/', () => new Response(null, { status: 201 }));
    await call('/v1/push/tokens', post({ deviceId: device(7), token: 'ExpoPushToken[fixture_device_7]' }, session.headers));
    expect(await sendPushNotification(ctx.env, ctx.deps, notice(session.userId))).toMatchObject({ accepted: 1, failed: 1 });
  });

  it('does not follow a redirect from the push service', async () => {
    const { ctx, session } = await ready();
    ctx.net.on('POST', 'https://fcm.googleapis.com/', () => new Response(null, { status: 302, headers: { location: 'https://evil.example/' } }));
    expect(await sendPushNotification(ctx.env, ctx.deps, notice(session.userId))).toMatchObject({ accepted: 0, failed: 1 });
    expect(ctx.net.calls.some((c) => c.url.startsWith('https://evil.example'))).toBe(false);
  });
});

describe('GitHub queue delivery to a browser-only recipient', () => {
  const repo = 'acme/api';
  const event = (): GitHubEventMessage => ({
    deliveryId: crypto.randomUUID(), event: 'pull_request', receivedAt: '2026-10-27T12:00:00.000Z',
    data: { kind: 'pr', installationId: '22', repo, numbers: [7], headSha: 'sha7', event: 'updated' },
  });

  it('delivers once with the PR title from the user\'s own search and no Expo call', async () => {
    const { ctx, browsers } = await ready();
    ctx.net.on('GET', 'https://api.github.com/user/installations?', { installations: [{ id: 22, suspended_at: null }] });
    ctx.net.on('GET', 'https://api.github.com/user/installations/22/repositories?', { total_count: 1, repositories: [{ full_name: repo }] });
    ctx.net.on('GET', 'https://api.github.com/search/issues?', (call: RecordedCall) => {
      const match = new URL(call.url).searchParams.get('q')?.includes('mentions:@me');
      return json({ total_count: match ? 1 : 0, incomplete_results: false, items: match ? [{ number: 7, title: 'Fix the cache' }] : [] });
    });
    ctx.net.on('POST', 'https://fcm.googleapis.com/', () => new Response(null, { status: 201 }));
    for (let i = 0; i < 2; i++) {
      const msg = { body: event(), ack: vi.fn(), retry: vi.fn() };
      await handleQueue({ queue: 'mergemate-github-events-local', messages: [msg], retryAll: vi.fn() } as unknown as MessageBatch<unknown>, ctx.env, ctx.time.now(), ctx.deps);
      expect(msg.ack).toHaveBeenCalledOnce();
    }
    expect(webCalls(ctx)).toHaveLength(1);
    expect(ctx.net.calls.some((c) => c.url.startsWith('https://exp.host/'))).toBe(false);
    expect(await browsers[0]?.open(webCalls(ctx)[0]?.bytes)).toEqual({ v: 1, kind: 'mention', repo, number: 7, title: 'Fix the cache' });
    expect(ctx.db.rows('SELECT kind, outcome FROM notification_push')).toEqual([{ kind: 'mention', outcome: 'accepted' }]);
  });
});
