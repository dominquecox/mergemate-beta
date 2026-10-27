import { readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const publicDir = new URL('../public/', import.meta.url);
for (const name of await readdir(new URL('assets/', publicDir))) {
  const match = name.match(/^(.+?)(?:\.[a-f0-9]{12})?\.(css|js|webp|svg)$/);
  if (!match) throw new Error(`Unexpected public asset: ${name}`);
  const file = new URL(`assets/${name}`, publicDir);
  const hash = createHash('sha256').update(await readFile(file)).digest('hex').slice(0, 12);
  const next = `${match[1]}.${hash}.${match[2]}`;
  if (next === name) continue;
  for (const page of await readdir(publicDir)) {
    if (!page.endsWith('.html')) continue;
    const path = new URL(page, publicDir);
    const html = await readFile(path, 'utf8');
    await writeFile(path, html.replaceAll(`/assets/${name}`, `/assets/${next}`));
  }
  await rename(file, new URL(`assets/${next}`, publicDir));
}
