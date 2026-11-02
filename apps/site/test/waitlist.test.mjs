import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const root = fileURLToPath(new URL('../', import.meta.url));
const origin = 'https://mergemate.dev';
let mf, db, dispatch;
const originalFetch = globalThis.fetch;
const pending = [];
let verification = { success: true, hostname: 'mergemate.dev', action: 'waitlist' };
let emailStatus = 200;
let emailThrows = false;
let emails = [];
let turnstileCalls = 0;
let ip = 0;
const pendingEmail = async () => {
  for (let n = 0; n < 100; n++) {
    const row = await db.prepare('SELECT email_status FROM waitlist LIMIT 1').first();
    if (row?.email_status !== 'pending') return row;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('Email status was not recorded');
};
function post(body = {}, headers = {}) {
  return dispatch(`${origin}/api/waitlist`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': `192.0.2.${++ip}`, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify({ email: 'reader@example.com', source: 'hero', turnstileToken: 'test-token', ...body }),
  });
}
before(async () => {
  const bundle = await build({ entryPoints: [`${root}src/index.ts`], bundle: true, format: 'esm', platform: 'browser', write: false });
  mf = new Miniflare(convertV4MiniflareOptions({ name: 'database-test', modules: true,
    script: 'export default { fetch() { return new Response("test database"); } }',
    compatibilityDate: '2026-10-26', d1Databases: ['DB'],
  }));
  db = await mf.getD1Database('DB');
  await db.prepare(await readFile(`${root}migrations/0001_waitlist.sql`, 'utf8')).run();
  await db.prepare(await readFile(`${root}migrations/0002_referral_hash.sql`, 'utf8')).run();
  const worker = (await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)).default;
  const counters = new Map();
  const env = {
    DB: db, TURNSTILE_SITE_KEY: 'test-site-key', EMAIL_FROM: 'mergemate@ploonu.com',
    TURNSTILE_SECRET_KEY: 'test-only', RESEND_API_KEY: 'test-only',
    WAITLIST_RATE_LIMITER: { async limit({ key }) { const n = (counters.get(key) ?? 0) + 1; counters.set(key, n); return { success: n <= 10 }; } },
    ASSETS: { async fetch(request) {
      const path = new URL(request.url).pathname;
      const text = await readFile(`${root}public${path}`);
      const type = path.endsWith('.html') ? 'text/html' : path.endsWith('.css') ? 'text/css' : 'text/plain';
      return new Response(request.method === 'HEAD' ? null : text, { headers: { 'Content-Type': type } });
    } },
  };
  dispatch = async (url, init) => worker.fetch(new Request(url, init), env, { waitUntil(promise) { pending.push(promise); } });
  globalThis.fetch = async (url, init) => {
    const request = new Request(url, init);
    if (request.url.includes('challenges.cloudflare.com')) { turnstileCalls++; return Response.json(verification); }
    if (request.url.includes('api.resend.com')) {
      if (emailThrows) throw new Error('Simulated network failure');
      emails.push({ headers: Object.fromEntries(request.headers), body: await request.json() });
      return Response.json({ id: 'test-email' }, { status: emailStatus });
    }
    throw new Error('Unexpected outbound request');
  };
});
after(async () => { await Promise.all(pending); globalThis.fetch = originalFetch; await mf?.dispose(); });
beforeEach(async () => {
  await Promise.all(pending); pending.length = 0;
  await db.exec('DELETE FROM waitlist'); emails = []; turnstileCalls = 0; emailStatus = 200; emailThrows = false;
  verification = { success: true, hostname: 'mergemate.dev', action: 'waitlist' };
});

describe('waitlist signup', () => {
  it('normalizes the email, stores only a token hash, and sends one plain-text confirmation', async () => {
    const response = await post({ email: '  Reader@Example.com ', source: 'footer' });
    assert.equal(response.status, 200, await response.clone().text()); assert.deepEqual(await response.json(), { ok: true });
    const row = await pendingEmail(); assert.equal(row.email_status, 'sent');
    const stored = await db.prepare('SELECT * FROM waitlist').first();
    assert.equal(stored.email, 'reader@example.com'); assert.equal(stored.source, 'footer');
    assert.match(stored.id, /^[a-f0-9-]{36}$/); assert.match(stored.remove_token_hash, /^[a-f0-9]{64}$/);
    assert.equal(emails.length, 1); assert.equal(emails[0].body.html, undefined);
    assert.equal(emails[0].body.from, 'mergemate@ploonu.com');
    assert.equal(emails[0].body.reply_to, 'support@mergemate.dev');
    assert.equal(emails[0].headers['idempotency-key'], `waitlist-${stored.id}`);
    assert.match(emails[0].body.text, /https:\/\/mergemate.dev\/waitlist\/remove\?token=[a-f0-9]{64}/);
    assert.ok(!emails[0].body.text.includes(stored.remove_token_hash));
  });
  it('returns identical responses for a duplicate without sending again', async () => {
    const first = await post(); await pendingEmail(); const duplicate = await post();
    assert.equal(first.status, duplicate.status); assert.equal(await first.text(), await duplicate.text());
    assert.equal((await db.prepare('SELECT count(*) AS n FROM waitlist').first()).n, 1); assert.equal(emails.length, 1);
  });
  it('makes simultaneous duplicates atomic', async () => {
    const responses = await Promise.all(Array.from({ length: 6 }, () => post()));
    assert.ok(responses.every(response => response.status === 200)); await pendingEmail();
    assert.equal(emails.length, 1); assert.equal((await db.prepare('SELECT count(*) AS n FROM waitlist').first()).n, 1);
  });
  it('rejects failed, wrong-host, and wrong-action Turnstile responses', async () => {
    for (const result of [{ success: false }, { success: true, hostname: 'evil.example', action: 'waitlist' }, { success: true, hostname: 'mergemate.dev', action: 'login' }]) {
      verification = result; const response = await post(); assert.equal(response.status, 400);
    }
    assert.equal((await db.prepare('SELECT count(*) AS n FROM waitlist').first()).n, 0); assert.equal(emails.length, 0);
  });
  it('validates addresses and source before calling a provider', async () => {
    for (const email of ['', 'missing-at', 'two@@example.com', 'spaces in@example.com', 'x@example.com\r\nBcc:bad', `${'a'.repeat(250)}@example.com`]) {
      assert.equal((await post({ email })).status, 400);
    }
    assert.equal((await post({ source: 'attacker' })).status, 400); assert.equal(turnstileCalls, 0);
  });
  it('requires a bounded challenge', async () => {
    for (const turnstileToken of ['', 'x'.repeat(2049), null]) assert.equal((await post({ turnstileToken })).status, 400);
    assert.equal(turnstileCalls, 0);
  });
  it('requires JSON, rejects malformed input and rejects cross-site submissions', async () => {
    assert.equal((await post({}, { 'Content-Type': 'text/plain' })).status, 415);
    assert.equal((await post('{bad')).status, 400);
    assert.equal((await post('null')).status, 400);
    assert.equal((await post({}, { Origin: 'https://evil.example' })).status, 403);
  });
  it('rejects oversized declared and actual bodies without a provider call', async () => {
    assert.equal((await post({}, { 'Content-Length': '9000' })).status, 413);
    assert.equal((await post(' '.repeat(8193))).status, 413); assert.equal(turnstileCalls, 0);
  });
  it('limits an IP before parsing or verifying a challenge', async () => {
    const headers = { 'CF-Connecting-IP': '198.51.100.99' };
    for (let i = 0; i < 10; i++) await post('malformed', headers);
    const response = await post('malformed', headers);
    assert.equal(response.status, 429); assert.equal(response.headers.get('Retry-After'), '60'); assert.equal(turnstileCalls, 0);
  });
  it('records rejected email delivery without failing or repeating the signup', async () => {
    emailStatus = 503; assert.equal((await post()).status, 200);
    assert.equal((await pendingEmail()).email_status, 'failed');
    assert.equal((await post()).status, 200); assert.equal(emails.length, 1);
  });
  it('records network send failure while keeping the signup', async () => {
    emailThrows = true; assert.equal((await post()).status, 200); assert.equal((await pendingEmail()).email_status, 'failed');
  });
});

describe('removal links', () => {
  it('deletes by a hashed 256-bit token; reuse never reveals membership', async () => {
    await post(); await pendingEmail();
    const link = emails[0].body.text.match(/https:\/\/mergemate.dev\/waitlist\/remove\?token=[a-f0-9]{64}/)[0];
    const page = await dispatch(link, { redirect: 'manual' });
    assert.equal(page.status, 200); assert.equal(page.headers.get('Cache-Control'), 'no-store');
    assert.equal(page.headers.get('Referrer-Policy'), 'no-referrer');
    assert.match(await page.text(), /<form method="post">/);
    assert.equal((await db.prepare('SELECT count(*) AS n FROM waitlist').first()).n, 1, 'opening the link must not remove');
    const response = await dispatch(link, { method: 'POST', redirect: 'manual', headers: { Origin: origin } });
    assert.equal(response.status, 303); assert.equal(response.headers.get('Location'), '/waitlist/removed');
    assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
    assert.equal((await db.prepare('SELECT count(*) AS n FROM waitlist').first()).n, 0);
    assert.equal((await dispatch(link, { method: 'POST', redirect: 'manual' })).status, 303);
  });
  it('rejects bad tokens and cross-site posts, and never removes on HEAD', async () => {
    await post(); await pendingEmail();
    assert.equal((await dispatch(`${origin}/waitlist/remove`)).status, 400);
    assert.equal((await dispatch(`${origin}/waitlist/remove?token=invalid`)).status, 400);
    assert.equal((await dispatch(`${origin}/waitlist/remove?token=${'a'.repeat(64)}`, { method: 'HEAD' })).status, 405);
    assert.equal((await dispatch(`${origin}/waitlist/remove?token=invalid`, { method: 'POST' })).status, 400);
    const link = emails[0].body.text.match(/https:\/\/mergemate.dev\/waitlist\/remove\?token=[a-f0-9]{64}/)[0];
    assert.equal((await dispatch(link, { method: 'POST', headers: { Origin: 'https://evil.example' } })).status, 403);
    assert.equal((await db.prepare('SELECT count(*) AS n FROM waitlist').first()).n, 1);
  });
});

describe('site routing and headers', () => {
  it('serves every public page and retains security headers on HTML and APIs', async () => {
    for (const path of ['/', '/privacy', '/terms', '/support', '/delete-account', '/waitlist/removed', '/robots.txt', '/sitemap.xml', '/api/health', '/api/config']) {
      const response = await dispatch(`${origin}${path}`); assert.equal(response.status, 200, path);
      assert.match(response.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
      assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
      assert.match(response.headers.get('Strict-Transport-Security'), /31536000/);
      assert.match(response.headers.get('Permissions-Policy'), /camera=\(\)/);
      assert.equal(response.headers.get('Cache-Control'), path.startsWith('/api/') ? 'no-store' : 'no-cache');
      if (!path.startsWith('/api/') && !path.endsWith('.txt') && !path.endsWith('.xml')) {
        const html = await response.text(); assert.match(html, /8063 Madison Ave/); assert.ok(!html.includes('mergemate@ploonu.com'));
      }
    }
  });
  it('blocks repository files, unknown routes and direct HTML paths even for navigations', async () => {
    for (const path of ['/wrangler.toml', '/README.md', '/package.json', '/.gitignore', '/.dev.vars', '/migrations/', '/docs/', '/index.html', '/privacy.html', '/admin', '/constructor', '/toString', '/no-such-page']) {
      const response = await dispatch(`${origin}${path}`, { headers: { 'Sec-Fetch-Mode': 'navigate' } });
      assert.equal(response.status, 404, path); assert.match(await response.text(), /Nothing to review here/);
    }
  });
  it('serves content-hashed assets immutably and supports HEAD', async () => {
    const html = await (await dispatch(origin)).text();
    const asset = html.match(/href="(\/assets\/site\.[a-f0-9]+\.css)"/)[1];
    const response = await dispatch(`${origin}${asset}`); assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'public, max-age=31536000, immutable');
    assert.equal((await dispatch(origin, { method: 'HEAD' })).status, 200);
  });
  it('uses a fixed apex redirect and exposes only the public site key', async () => {
    const response = await dispatch('https://www.mergemate.dev/privacy?ref=footer', { redirect: 'manual' });
    assert.equal(response.status, 308); assert.equal(response.headers.get('Location'), `${origin}/privacy?ref=footer`);
    assert.deepEqual(await (await dispatch(`${origin}/api/config`)).json(), { siteKey: 'test-site-key' });
    assert.deepEqual(await (await dispatch(`${origin}/api/health`)).json(), { ok: true });
    assert.equal((await dispatch('https://evil.example/')).status, 404);
  });
});

it('preserves public post URLs with fixed-target redirects and leaves waitlist routes intact',async()=>{
  for(const [path,target] of [['/news','/news'],['/changelog','/changelog'],['/news/hello?next=https://evil.example','/posts/hello'],['/changelog/release-one','/posts/release-one']]){
    const response=await dispatch(origin+path);assert.equal(response.status,302);assert.equal(response.headers.get('Location'),'https://app.mergemate.dev'+target);assert.equal(response.headers.get('Cache-Control'),'no-cache');
  }
  const bad=await dispatch(origin+'/news/bad%2Fslug');assert.equal(bad.status,404);
  const home=await dispatch(origin+'/');assert.equal(home.status,200);assert.match(await home.text(),/waitlist/i);
});

it('hashes bounded referral codes without changing duplicate responses', async () => {
  const first=await post({email:'referral@example.com',referralCode:'campaign_2026'});
  assert.equal(first.status,200);
  const row=await db.prepare("SELECT referral_hash FROM waitlist WHERE email=?").bind('referral@example.com').first();
  assert.match(row.referral_hash,/^[a-f0-9]{64}$/);
  assert.notEqual(row.referral_hash,'campaign_2026');
  assert.equal((await post({email:'referral@example.com',referralCode:'other'})).status,200);
  assert.deepEqual(await db.prepare("SELECT referral_hash FROM waitlist WHERE email=?").bind('referral@example.com').first(),row);
  assert.equal((await post({referralCode:'bad code'})).status,400);
});
