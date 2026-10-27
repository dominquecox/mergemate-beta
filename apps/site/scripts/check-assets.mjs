import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
const publicDir = new URL('../public/', import.meta.url);
let compressed = 0;
for (const name of await readdir(new URL('assets/', publicDir))) {
  const bytes = await readFile(new URL(`assets/${name}`, publicDir));
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
  assert.ok(name.includes(`.${hash}.`), `Stale hash: ${name}`);
  if (!name.endsWith('.webp') && !name.endsWith('.svg')) compressed += gzipSync(bytes).byteLength;
}
for (const name of await readdir(publicDir)) {
  if (!name.endsWith('.html')) continue;
  const bytes = await readFile(new URL(name, publicDir));
  const html = bytes.toString(); compressed += gzipSync(bytes).byteLength;
  assert.ok(!html.includes('mergemate@ploonu.com'), 'Private sender listed on a page');
  for (const reference of html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)) await readFile(new URL(reference[1].slice(1), publicDir));
  for (const image of html.matchAll(/<img\b[^>]+>/g)) { assert.match(image[0], /width="\d+"/); assert.match(image[0], /height="\d+"/); assert.match(image[0], /alt="/); }
  assert.ok(!/<script(?![^>]*src=)/.test(html), 'Inline script is forbidden by CSP');
}
assert.ok(compressed < 100 * 1024, `${compressed} compressed bytes exceeds budget`);
console.log(`PASS asset hashes, references, image dimensions, public contact, CSP; all HTML/CSS/JS ${compressed} bytes gzip combined`);
