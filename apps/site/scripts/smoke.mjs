import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
// Use an already-installed Playwright. No application dependency is added for this check.
const require = createRequire(import.meta.url);
const { chromium } = process.env.PLAYWRIGHT_MODULE ? require(process.env.PLAYWRIGHT_MODULE) : require('playwright');
const base = process.env.SITE_SMOKE_URL ?? 'http://127.0.0.1:8783';
const output = process.env.SITE_SMOKE_OUTPUT ?? '/tmp/mergemate-site-smoke';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) });
try {
  for (const [width, theme] of [[360, 'light'], [393, 'dark'], [1280, 'light'], [1440, 'dark']]) {
    const context = await browser.newContext({ viewport: { width, height: 950 }, colorScheme: theme });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // Only browser-side providers are mocked here; the real Worker serves all pages and assets.
    await page.route('**/api/config', route => route.fulfill({ json: { siteKey: 'test-site-key' } }));
    await page.route('https://challenges.cloudflare.com/**', route => route.fulfill({ contentType: 'application/javascript', body: `
      window.turnstile = {render(element, options) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Complete test check';
        button.addEventListener('click', () => options.callback('test-token')); element.appendChild(button);
        return element.id;
      }, reset() {}}; window.onWaitlistTurnstile();
    ` }));
    let submissions = [];
    await page.route('**/api/waitlist', route => {
      submissions.push(route.request().postDataJSON());
      return route.fulfill({ json: { ok: true } });
    });
    const response = await page.goto(base, { waitUntil: 'networkidle' });
    assert.equal(response.status(), 200);
    assert.equal(await page.locator('h1').innerText(), 'Code review that fits in your pocket.');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: overflow`);
    assert.equal(await page.locator('[data-waitlist]').count(), 2);
    const hero = page.locator('[data-waitlist="hero"]');
    await hero.getByRole('button', { name: 'Join the waitlist' }).click();
    await hero.getByRole('status').getByText('Enter a valid email address.').waitFor();
    await hero.getByLabel('Work or personal email').fill('reader@example.com');
    await hero.getByRole('button', { name: 'Join the waitlist' }).click();
    await hero.getByRole('status').getByText('Please complete the check and try again.').waitFor();
    await hero.getByRole('button', { name: 'Complete test check' }).click();
    await hero.getByLabel('Work or personal email').focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.locator(':focus').innerText(), 'Join the waitlist');
    await page.keyboard.press('Enter');
    await hero.getByRole('status').getByText("You're on the list. Check your inbox for a confirmation.").waitFor();
    assert.equal(submissions[0].source, 'hero');
    const footer = page.locator('[data-waitlist="footer"]');
    await footer.getByLabel('Work or personal email').fill('second@example.com');
    await footer.getByRole('button', { name: 'Complete test check' }).click();
    await footer.getByRole('button', { name: 'Join the waitlist' }).click();
    await footer.getByRole('status').getByText("You're on the list. Check your inbox for a confirmation.").waitFor();
    assert.equal(submissions[1].source, 'footer');
    await page.getByText('Does MergeMate change my code?', { exact: true }).click();
    assert.equal(await page.locator('details[open]').count(), 1);
    await page.screenshot({ path: `${output}/${width}-${theme}.png`, fullPage: true });
    for (const path of ['/privacy', '/terms', '/support', '/delete-account', '/waitlist/removed']) {
      const result = await page.goto(base + path); assert.equal(result.status(), 200);
      assert.ok(await page.locator('h1').isVisible());
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${path}: overflow`);
    }
    for (const path of ['/wrangler.toml', '/package.json', '/README.md', '/.gitignore', '/migrations/', '/docs/']) {
      assert.equal((await page.goto(base + path)).status(), 404);
    }
    assert.deepEqual(errors, []);
    console.log(`PASS ${width}px ${theme}: forms, FAQ, legal pages, leak checks, no overflow or browser errors`);
    await context.close();
  }
} finally { await browser.close(); }
