import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';

// Exercises the actual Worker and production export with local fixture upstreams only.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const dist = path.join(root, 'apps/mobile/dist');
const bundled = await build({ entryPoints: [path.join(root, 'apps/web/src/index.ts')], bundle: true, write: false, format: 'esm', platform: 'neutral' });
const worker = (await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`)).default;
const upstream = [], manifestCookies = [];
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };
const env = {
  API_ORIGIN: 'https://api-dev.mergemate.dev', DEV_API_PROXY: '1',
  DEV_API: { async fetch(request) {
    upstream.push(new URL(request.url).pathname);
    assert(!request.headers.get('cookie')?.includes('CF_Authorization'));
    return Response.json({ error: { code: request.method === 'GET' ? 'unauthorized' : 'bad_request', message: 'Local fixture response' } }, { status: request.method === 'GET' ? 401 : 400 });
  } },
  ASSETS: { async fetch(request) {
    let pathname = new URL(request.url).pathname;
    if (pathname === '/manifest.webmanifest') {
      const authenticated = request.headers.get('cookie')?.includes('CF_Authorization=fixture-access') ?? false;
      manifestCookies.push(authenticated);
      if (!authenticated) return Response.redirect('https://access-fixture.invalid/login', 302);
    }
    const target = path.resolve(dist, `.${pathname}`);
    if (!target.startsWith(`${dist}${path.sep}`) && target !== dist) return new Response('Not found', { status: 404 });
    let body;
    try { body = await readFile(target); } catch { pathname = '/index.html'; body = await readFile(path.join(dist, 'index.html')); }
    return new Response(body, { headers: { 'Content-Type': types[path.extname(pathname)] ?? 'application/octet-stream' } });
  } },
};
const server = createServer(async (incoming, outgoing) => {
  try {
    const chunks = []; for await (const chunk of incoming) chunks.push(chunk);
    const request = new Request(`http://${incoming.headers.host}${incoming.url}`, { method: incoming.method, headers: incoming.headers, ...(chunks.length ? { body: Buffer.concat(chunks) } : {}) });
    const response = await worker.fetch(request, env);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) { outgoing.writeHead(500); outgoing.end(String(error)); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/chromium'), args: ['--no-sandbox'] });
  const context = await browser.newContext();
  await context.addCookies([{ name: 'CF_Authorization', value: 'fixture-access', url: origin, httpOnly: true, sameSite: 'Lax' }]);
  const page = await context.newPage(), requests = [], errors = [];
  page.on('request', request => requests.push(request.url())); page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', event => window.__csp.push({ directive: event.violatedDirective, blocked: event.blockedURI })); });
  await page.goto(`${origin}/sign-in`, { waitUntil: 'networkidle' });
  assert(upstream.includes('/v1/me'), 'Production bundle must call the same-origin proxy');
  assert(!requests.some(url => url.startsWith('https://api-dev.mergemate.dev')));
  const cdp = await context.newCDPSession(page), manifest = await cdp.send('Page.getAppManifest');
  assert(manifest.data.includes('MergeMate'), JSON.stringify(manifest));
  assert(manifestCookies.length > 0 && manifestCookies.every(Boolean), 'Manifest must include existing Access cookie');
  const status = await page.evaluate(async () => (await fetch('/__api/v1/auth/github/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status);
  assert.equal(status, 400); assert(upstream.includes('/v1/auth/github/start'));
  assert.deepEqual(await page.evaluate(() => window.__csp), []); assert.deepEqual(errors, []);
  console.log('PASS: production bundle /v1/me and auth-start probe use actual same-origin Worker proxy under unchanged CSP');
  console.log('PASS: protected manifest includes existing HttpOnly Access cookie; browser validation does not attempt eval');
  console.log('Fixture-only: no live OAuth, real Access login, model execution or deployment.');
} finally { if (browser) await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
