/* global console, process, navigator, caches, Notification, PushManager, document, window */
// Fixture browser check for the installable web app: serves the web export locally, intercepts all API traffic
// and checks service worker registration, the cache contents, the offline page and that nothing asks for
// notification permission on load. Makes no request to a real API or push service.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
const proof = process.env.MM_PWA_PROOF_DIR ?? join(tmpdir(), 'mergemate-pwa');
await mkdir(proof, { recursive: true });
const TYPES = { '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.ico': 'image/x-icon' };

let down = false;
const server = createServer(async (req, res) => {
  if (down) { req.socket.destroy(); return; }
  try {
    const path = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!path.startsWith(root + sep) && path !== root) { res.writeHead(404).end(); return; }
    let body; let file = path;
    try { body = await readFile(path); } catch { file = resolve(root, 'index.html'); body = await readFile(file); }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'text/html', 'cache-control': 'no-cache' });
    res.end(body);
  } catch { res.writeHead(500).end(); }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;

let browser;
try {
  // CHROMIUM_PATH: optional path to an installed Chromium when Playwright's own download is not present.
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  for (const width of [393, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'allow' });
    // Count any attempt to ask for notification permission or to subscribe.
    await context.addInitScript(() => {
      window.__prompts = 0;
      if (typeof Notification !== 'undefined') {
        const original = Notification.requestPermission.bind(Notification);
        Notification.requestPermission = (...args) => { window.__prompts++; return original(...args); };
      }
      if (typeof PushManager !== 'undefined') {
        const subscribe = PushManager.prototype.subscribe;
        PushManager.prototype.subscribe = function (...args) { window.__prompts++; return subscribe.apply(this, args); };
      }
    });
    await context.route('https://api-dev.mergemate.dev/**', (route) => route.fulfill({
      status: 401, contentType: 'application/json',
      headers: { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true' },
      body: JSON.stringify({ error: { code: 'unauthorized', message: 'Sign in again.', requestId: 'local-fixture' } }),
    }));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(`${origin}/`);
    const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
    assert.equal(scope, `${origin}/`);
    await page.reload();
    await page.evaluate(() => navigator.serviceWorker.ready);
    const state = await page.evaluate(async () => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      const keys = await caches.keys();
      const entries = [];
      for (const key of keys) for (const request of await (await caches.open(key)).keys()) entries.push(new URL(request.url).pathname);
      return { registrations: registrations.length, script: registrations[0]?.active?.scriptURL, keys, entries, prompts: window.__prompts };
    });
    assert.deepEqual(state, { registrations: 1, script: `${origin}/sw.js`, keys: ['mergemate-shell-v1'], entries: ['/offline.html'], prompts: 0 });

    const manifest = await (await page.request.get(`${origin}/manifest.webmanifest`)).json();
    for (const icon of manifest.icons) assert.equal((await page.request.get(origin + icon.src)).status(), 200);

    // The site goes down: a page load shows the offline page instead of a browser error.
    down = true;
    await page.goto(`${origin}/inbox`);
    await page.getByRole('heading', { name: "You're offline" }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.screenshot({ path: `${proof}/offline-${width}.png`, fullPage: true });

    // Back online: Try again loads the app from the network, not a stored copy.
    down = false;
    await page.getByRole('link', { name: 'Try again' }).click();
    // Signed out, the app opens on the welcome steps (first visit) or sign-in.
    await page.getByText(/^(Skip|Continue with GitHub)$/).first().waitFor({ timeout: 15000 });
    await page.screenshot({ path: `${proof}/online-${width}.png`, fullPage: true });
    assert.equal(await page.evaluate(() => window.__prompts), 0);
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log(`PASS: one service worker at scope /, only /offline.html cached, offline page on network failure, recovery online, no permission prompt or subscription, at 393/1440. Screenshots: ${proof}`);
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
