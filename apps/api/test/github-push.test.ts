import { describe, expect, it, vi } from 'vitest';
import type { NotificationKind } from '@mergemate/contracts';
import { type GitHubEventMessage } from '../src/lib/github-webhooks';
import { saveTokens } from '../src/lib/github-tokens';
import { notificationId } from '../src/lib/notification-id';
import { defaultSettings } from '../src/lib/settings';
import { handleQueue } from '../src/queues';
import { json, testContext, type RecordedCall, type TestContext } from './helpers';
import { appFor, ghUser, post, signIn, tokenResponse } from './sign-in';

const repo = 'acme/api';
const expoUrl = 'https://exp.host/--/api/v2/push/send';
const event = (number = 7): GitHubEventMessage => ({
  deliveryId: crypto.randomUUID(), event: 'pull_request', receivedAt: '2026-10-27T12:00:00.000Z',
  data: { kind: 'pr', installationId: '22', repo, numbers: [number], headSha: 'sha7', event: 'updated' },
});
const sent = (ctx: TestContext) => ctx.net.calls.filter((c) => c.url === expoUrl);
const searches = (ctx: TestContext) => ctx.net.calls.filter((c) => c.url.includes('/search/issues'));
const markers = (ctx: TestContext) => ctx.db.rows('SELECT * FROM notification_push');
async function drain(ctx: TestContext, body = event()) {
  const msg = { body, ack: vi.fn(), retry: vi.fn() };
  const batch = { queue: 'mergemate-github-events-local', messages: [msg], retryAll: vi.fn() };
  await handleQueue(batch as unknown as MessageBatch<unknown>, ctx.env, ctx.time.now(), ctx.deps);
  expect(msg.ack).toHaveBeenCalledOnce(); expect(msg.retry).not.toHaveBeenCalled();
}
async function fixture(kind: NotificationKind = 'review') {
  const ctx = testContext({ EXPO_ACCESS_TOKEN: 'fixture-not-real' });
  const session = await signIn(ctx);
  await appFor(ctx)('/v1/push/tokens', post({ deviceId: 'device_0001', token: 'ExpoPushToken[fixture_device_1]' }, session.headers));
  ctx.net.on('GET', 'https://api.github.com/user/installations?', { installations: [{ id: 22, suspended_at: null }] });
  ctx.net.on('GET', 'https://api.github.com/user/installations/22/repositories?', { total_count: 1, repositories: [{ full_name: repo }] });
  const qualifier = { review: 'review-requested:@me', mention: 'mentions:@me', mine: 'author:@me' }[kind];
  ctx.net.on('GET', 'https://api.github.com/search/issues?', (call: RecordedCall) => {
    const q = new URL(call.url).searchParams.get('q');
    expect(q).toContain(`repo:${repo}`);
    return json({ total_count: q?.includes(qualifier) ? 1 : 0, incomplete_results: false, items: q?.includes(qualifier) ? [{ number: 7 }] : [] });
  });
  ctx.net.on('POST', expoUrl, { data: [{ status: 'ok', id: 'ticket_7' }] });
  return { ctx, session };
}

describe('GitHub queue push delivery', () => {
  it.each(['review', 'mention', 'mine'] as const)('delivers enabled %s with the inbox id and generic copy', async (kind) => {
    const { ctx, session } = await fixture(kind);
    await drain(ctx);
    expect(sent(ctx)).toHaveLength(1);
    expect(JSON.parse(sent(ctx)[0]?.body ?? '[]')[0]).toMatchObject({ title: 'MergeMate', data: { notificationId: notificationId(repo, 7) } });
    expect(sent(ctx)[0]?.body).not.toContain(repo);
    expect(markers(ctx)).toMatchObject([{ user_id: session.userId, kind, outcome: 'accepted' }]);
    for (const call of searches(ctx)) expect(call.headers.get('authorization')).toBe('Bearer ghu_testaccess1');
  });

  it.each(['quiet', 'disabled'] as const)('suppresses %s and never sends that item on later redelivery', async (reason) => {
    const { ctx, session } = await fixture();
    const settings = defaultSettings();
    if (reason === 'disabled') settings.notifications.review = false;
    else settings.quietHours = { start: '11:00', end: '13:00', timeZone: 'UTC' };
    await appFor(ctx)('/v1/settings', { ...post(settings, session.headers), method: 'PUT' });
    await drain(ctx);
    expect(sent(ctx)).toHaveLength(0); expect(markers(ctx)).toMatchObject([{ outcome: 'suppressed' }]);
    await appFor(ctx)('/v1/settings', { ...post(defaultSettings(), session.headers), method: 'PUT' });
    await drain(ctx);
    expect(sent(ctx)).toHaveLength(0);
  });

  it('rejects a recipient without repository access before notification lookup or send', async () => {
    const { ctx } = await fixture();
    ctx.net.on('GET', 'https://api.github.com/user/installations/22/repositories?', { total_count: 0, repositories: [] });
    await drain(ctx);
    expect(sent(ctx)).toHaveLength(0); expect(searches(ctx)).toHaveLength(0); expect(markers(ctx)).toEqual([]);
  });

  it('uses a fresh cache but rechecks at ten minutes and fails closed on revoked access', async () => {
    const { ctx, session } = await fixture();
    await ctx.env.DB.prepare('INSERT INTO user_repo_access(user_id,full_name) VALUES(?,?)').bind(session.userId, repo).run();
    await ctx.env.DB.prepare('INSERT INTO user_access_checks(user_id,checked_at) VALUES(?,?)').bind(session.userId, ctx.time.now().toISOString()).run();
    await drain(ctx);
    expect(ctx.net.calls.some((c) => c.url.includes('/user/installations'))).toBe(false);
    ctx.time.advance(10 * 60_000);
    ctx.net.on('GET', 'https://api.github.com/user/installations?', { installations: [] });
    await drain(ctx, event(8));
    expect(sent(ctx)).toHaveLength(1);
    expect(ctx.db.rows('SELECT * FROM user_repo_access')).toEqual([]);
  });

  it('does not use stale access if GitHub denies the permission refresh', async () => {
    const { ctx, session } = await fixture();
    await ctx.env.DB.prepare('INSERT INTO user_repo_access(user_id,full_name) VALUES(?,?)').bind(session.userId, repo).run();
    ctx.net.on('GET', 'https://api.github.com/user/installations?', () => json({}, 403));
    await drain(ctx);
    expect(sent(ctx)).toHaveLength(0); expect(searches(ctx)).toHaveLength(0);
  });

  it('deduplicates concurrent messages and a different delivery for the same inbox item', async () => {
    const { ctx } = await fixture();
    await Promise.all([drain(ctx), drain(ctx)]);
    await drain(ctx);
    expect(sent(ctx)).toHaveLength(1); expect(markers(ctx)).toHaveLength(1);
  });

  it.each(['transport', 'server', 'outcome-write'] as const)('acks %s failure and never resends on redelivery', async (failure) => {
    const { ctx } = await fixture();
    if (failure === 'transport') ctx.net.on('POST', expoUrl, () => { throw new Error('Ambiguous response'); });
    if (failure === 'server') ctx.net.on('POST', expoUrl, () => json({}, 500));
    if (failure === 'outcome-write') ctx.db.sqlite.exec("CREATE TRIGGER fail_outcome BEFORE UPDATE ON notification_push BEGIN SELECT RAISE(ABORT, 'storage unavailable'); END");
    await drain(ctx); await drain(ctx);
    expect(sent(ctx)).toHaveLength(1); expect(markers(ctx)).toHaveLength(1);
  });

  it('does not notify suspended users or an unrelated user who can read the repo', async () => {
    const { ctx, session } = await fixture();
    const other = await signIn(ctx, 'ios', { ...ghUser, id: 4243, login: 'other' });
    await appFor(ctx)('/v1/push/tokens', post({ deviceId: 'device_0002', token: 'ExpoPushToken[fixture_device_2]' }, other.headers));
    await ctx.env.DB.prepare("UPDATE users SET status='suspended' WHERE id=?").bind(session.userId).run();
    ctx.net.on('GET', 'https://api.github.com/search/issues?', { total_count: 0, incomplete_results: false, items: [] });
    await drain(ctx);
    expect(sent(ctx)).toHaveLength(0); expect(markers(ctx)).toEqual([]);
  });

  it('checks each recipient with their own credential and isolates a denied user', async () => {
    const { ctx, session } = await fixture();
    const other = await signIn(ctx, 'ios', { ...ghUser, id: 4243, login: 'other' });
    await saveTokens(ctx.env, other.userId, { accessToken: tokenResponse(2).access_token,
      accessExpiresAt: null, refreshToken: null, refreshExpiresAt: null }, ctx.time.now());
    await appFor(ctx)('/v1/push/tokens', post({ deviceId: 'device_0002', token: 'ExpoPushToken[fixture_device_2]' }, other.headers));
    ctx.net.on('GET', 'https://api.github.com/user/installations?', (call: RecordedCall) => json({
      installations: call.headers.get('authorization') === 'Bearer ghu_testaccess1' ? [{ id: 22, suspended_at: null }] : [],
    }));
    ctx.net.on('GET', 'https://api.github.com/user/installations/22/repositories?', { total_count: 1, repositories: [{ full_name: repo }] });
    await drain(ctx);
    expect(sent(ctx)).toHaveLength(1);
    expect(markers(ctx)).toMatchObject([{ user_id: session.userId }]);
    expect(searches(ctx).every((c) => c.headers.get('authorization') === 'Bearer ghu_testaccess1')).toBe(true);
  });

  it('finds an exact item on a later search page without treating text matches as ids', async () => {
    const { ctx } = await fixture();
    ctx.net.on('GET', 'https://api.github.com/search/issues?', (call: RecordedCall) => json({
      total_count: 101, incomplete_results: false,
      items: new URL(call.url).searchParams.get('page') === '1'
        ? Array.from({ length: 100 }, (_, i) => ({ number: i + 100 })) : [{ number: 7 }],
    }));
    await drain(ctx);
    expect(sent(ctx)).toHaveLength(1); expect(searches(ctx)).toHaveLength(2);
  });

  it('refreshes permission again when notification lookup outlives the cache TTL', async () => {
    const { ctx } = await fixture();
    ctx.net.on('GET', 'https://api.github.com/search/issues?', () => {
      ctx.time.advance(10 * 60_000);
      ctx.net.on('GET', 'https://api.github.com/user/installations?', { installations: [] });
      return json({ total_count: 1, incomplete_results: false, items: [{ number: 7 }] });
    });
    await drain(ctx);
    expect(sent(ctx)).toHaveLength(0); expect(markers(ctx)).toEqual([]);
  });

  it('honors muted repositories and snoozed notifications', async () => {
    const { ctx, session } = await fixture();
    await ctx.env.DB.prepare('INSERT INTO repo_watch VALUES(?,?,?,?,?)').bind(session.userId, '1', repo, 0, ctx.time.now().toISOString()).run();
    await drain(ctx); expect(searches(ctx)).toHaveLength(0);
    await ctx.env.DB.prepare('DELETE FROM repo_watch').run();
    await appFor(ctx)(`/v1/notifications/${notificationId(repo, 7)}/snooze`, post({ until: '2026-10-28T12:00:00Z' }, session.headers));
    await drain(ctx); expect(sent(ctx)).toHaveLength(0);
  });

  it('resolves status events through activity and ignores non-matching/incomplete search results', async () => {
    const { ctx } = await fixture();
    ctx.net.on('GET', 'https://api.github.com/search/issues?', { total_count: 1, incomplete_results: true, items: [{ number: 7 }] });
    await drain(ctx); expect(sent(ctx)).toHaveLength(0);
    ctx.net.on('GET', 'https://api.github.com/search/issues?', { total_count: 1, incomplete_results: false, items: [{ number: 17 }] });
    await drain(ctx); expect(sent(ctx)).toHaveLength(0);
    ctx.net.on('GET', 'https://api.github.com/search/issues?', { total_count: 1, incomplete_results: false, items: [{ number: 7 }] });
    await drain(ctx, { ...event(), event: 'status', data: { kind: 'status', repo, installationId: '22', sha: 'sha7' } });
    expect(sent(ctx)).toHaveLength(1);
  });

  it('skips users already known to lack the repo without any GitHub call', async () => {
    const { ctx, session } = await fixture();
    ctx.db.sqlite.prepare("INSERT INTO user_access_checks(user_id,checked_at) VALUES(?,?)").run(session.userId, ctx.time.now().toISOString());
    const before = ctx.net.calls.length;
    await drain(ctx);
    expect(ctx.net.calls.slice(before).filter((c) => c.url.startsWith('https://api.github.com/'))).toHaveLength(0);
    expect(sent(ctx)).toHaveLength(0);
  });
});
