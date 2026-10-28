type Env = SiteBindings & { TURNSTILE_SECRET_KEY?: string; RESEND_API_KEY?: string };

const ORIGIN = 'https://mergemate.dev';
const CSP = "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; connect-src 'self'; img-src 'self' data:; style-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
const PAGES: Record<string, string> = {
  '/': '/index.html', '/privacy': '/privacy.html', '/terms': '/terms.html',
  '/support': '/support.html', '/delete-account': '/delete-account.html',
  '/waitlist/removed': '/removed.html', '/robots.txt': '/robots.txt', '/sitemap.xml': '/sitemap.xml',
};
const ASSETS = /^\/assets\/[a-z0-9-]+\.[a-f0-9]{12}\.(?:css|js|webp|svg)$/;

function secure(response: Response, kind: 'api' | 'html' | 'asset' = 'api'): Response {
  const headers = new Headers(response.headers);
  headers.set('Content-Security-Policy', CSP);
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  headers.set('Cache-Control', kind === 'api' ? 'no-store' : kind === 'asset' ? 'public, max-age=31536000, immutable' : 'no-cache');
  return new Response(response.body, { status: response.status, headers });
}
function json(body: object, status = 200, extra: Record<string, string> = {}): Response {
  return secure(Response.json(body, { status, headers: extra }));
}
function error(code: string, status: number): Response { return json({ ok: false, error: code }, status); }

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, '0')).join('');
}
function removalToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join('');
}
class BodyTooLarge extends Error {}
async function readJson(request: Request): Promise<unknown> {
  if (Number(request.headers.get('Content-Length')) > 8192) throw new BodyTooLarge();
  if (!request.body) throw new SyntaxError();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) { await reader.cancel(); throw new BodyTooLarge(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)) as unknown;
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function verifyTurnstile(token: string, env: Env, hostname: string): Promise<boolean> {
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY ?? '', response: token }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) return false;
  const result: unknown = await response.json();
  return record(result) && result.success === true && result.hostname === hostname && result.action === 'waitlist';
}
async function sendConfirmation(env: Env, id: string, email: string, token: string): Promise<void> {
  let status = 'failed';
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY ?? ''}`, 'Content-Type': 'application/json', 'Idempotency-Key': `waitlist-${id}` },
      body: JSON.stringify({
        from: env.EMAIL_FROM, to: [email], reply_to: 'support@mergemate.dev',
        subject: "You're on the MergeMate waitlist",
        text: `Thanks for joining the MergeMate waitlist.\n\nMergeMate brings code review to your pocket, on iPhone and the web.\n\nWe'll email you once when MergeMate opens. No spam.\n\nLeave the list anytime:\n${ORIGIN}/waitlist/remove?token=${token}\n\nIf you didn't request this, use the link above or contact support@mergemate.dev.\n\nPloonu LLC\n8063 Madison Ave, PMB 576\nIndianapolis, IN 46227, United States`,
      }),
      signal: AbortSignal.timeout(10000),
    });
    status = response.ok ? 'sent' : 'failed';
    await response.body?.cancel();
  } catch { /* Signup survives an email failure. No message, address or token is logged. */ }
  await env.DB.prepare('UPDATE waitlist SET email_status = ? WHERE id = ?').bind(status, id).run();
}

async function signup(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const limited = await env.WAITLIST_RATE_LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') ?? 'local' });
  if (!limited.success) return json({ ok: false, error: 'rate_limited' }, 429, { 'Retry-After': '60' });
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) return error('invalid_origin', 403);
  if (request.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') return error('json_required', 415);
  let body: unknown;
  try { body = await readJson(request); }
  catch (e) { return error(e instanceof BodyTooLarge ? 'body_too_large' : 'invalid_json', e instanceof BodyTooLarge ? 413 : 400); }
  if (!record(body) || typeof body.email !== 'string') return error('invalid_email', 400);
  const email = body.email.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || Array.from(email).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return error('invalid_email', 400);
  if (body.source !== undefined && body.source !== 'hero' && body.source !== 'footer') return error('invalid_source', 400);
  if (typeof body.turnstileToken !== 'string' || !body.turnstileToken || body.turnstileToken.length > 2048) return error('invalid_challenge', 400);
  if (!env.TURNSTILE_SECRET_KEY || !env.RESEND_API_KEY || env.EMAIL_FROM !== 'mergemate@ploonu.com') return error('unavailable', 503);
  let valid = false;
  try { valid = await verifyTurnstile(body.turnstileToken, env, url.hostname); }
  catch { return error('unavailable', 503); }
  if (!valid) return error('invalid_challenge', 400);
  const id = crypto.randomUUID();
  const token = removalToken();
  // A single atomic insert selects the email sender, including simultaneous duplicate requests.
  const inserted = await env.DB.prepare('INSERT INTO waitlist (id, email, source, remove_token_hash) VALUES (?, ?, ?, ?) ON CONFLICT(email) DO NOTHING RETURNING id')
    .bind(id, email, body.source ?? 'hero', await sha256(token)).first<{ id: string }>();
  if (inserted) ctx.waitUntil(sendConfirmation(env, id, email, token).catch(() => { console.error('{"event":"waitlist_email_status_failed"}'); }));
  return json({ ok: true });
}

// Mail scanners open links, so GET only shows a confirmation page; the delete needs the form POST.
async function removal(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'POST') return error('method_not_allowed', 405);
  const token = url.searchParams.get('token');
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return error('invalid_link', 400);
  let response: Response;
  if (request.method === 'GET') {
    const page = new URL(request.url);
    page.pathname = '/remove.html';
    page.search = '';
    const asset = await env.ASSETS.fetch(new Request(page, { method: 'GET' }));
    response = secure(new Response(asset.body, { status: asset.status, headers: asset.headers }), 'html');
    response.headers.set('Cache-Control', 'no-store');
  } else {
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin) return error('invalid_origin', 403);
    await env.DB.prepare('DELETE FROM waitlist WHERE remove_token_hash = ?').bind(await sha256(token)).run();
    response = secure(new Response(null, { status: 303, headers: { Location: '/waitlist/removed' } }));
  }
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}

async function handle(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  if (url.hostname === 'www.mergemate.dev') {
    // Never reflect an attacker-controlled destination into a redirect.
    return secure(new Response(null, { status: 308, headers: { Location: `${ORIGIN}${url.pathname}${url.search}` } }));
  }
  if (!['mergemate.dev', 'localhost', '127.0.0.1'].includes(url.hostname)) return error('not_found', 404);
  if (url.pathname === '/api/waitlist' && request.method === 'POST') return signup(request, env, ctx);
  if (url.pathname === '/waitlist/remove') return removal(request, env, url);
  if (request.method !== 'GET' && request.method !== 'HEAD') return error('method_not_allowed', 405);
  // Existing public RSS URLs stay stable; the app's public reader owns article rendering.
  const article=/^\/(news|changelog)\/([a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?)$/.exec(url.pathname);
  const publicList=['/news','/changelog'].includes(url.pathname)?url.pathname:null;
  if(article||publicList)return secure(new Response(null,{status:302,headers:{Location:`https://app.mergemate.dev${article?`/posts/${article[2]}`:publicList}`}}),'html');
  if (url.pathname === '/api/health') return json({ ok: true });
  if (url.pathname === '/api/config') return json({ siteKey: env.TURNSTILE_SITE_KEY });
  const file = Object.hasOwn(PAGES, url.pathname) ? PAGES[url.pathname] : (ASSETS.test(url.pathname) ? url.pathname : null);
  const assetUrl = new URL(request.url);
  assetUrl.pathname = file ?? '/404.html';
  assetUrl.search = '';
  const asset = await env.ASSETS.fetch(new Request(assetUrl, { method: request.method }));
  const status = file ? asset.status : 404;
  return secure(new Response(asset.body, { status, headers: asset.headers }), file && ASSETS.test(file) && status === 200 ? 'asset' : 'html');
}
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try { return await handle(request, env, ctx); }
    catch { return error('unavailable', 503); }
  },
} satisfies ExportedHandler<Env>;
