import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// Workers reject fetch's redirect "error" with a TypeError before any request is sent, so it must never be used.
const SRC = join(__dirname, '..', 'src');
const files = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? files(path) : /\.(ts|tsx|js|mjs)$/.test(name) ? [path] : [];
});
const USES_ERROR = /\bredirect\s*:\s*(['"`])error\1/;

describe('fetch redirect mode', () => {
  it('no API source passes redirect "error" to fetch', () => {
    const offenders = files(SRC).flatMap((file) => readFileSync(file, 'utf8').split('\n').flatMap((line, index) => {
      const code = line.trim().startsWith('*') ? '' : line.replace(/\/\/\s.*$/, '');
      return USES_ERROR.test(code) ? [`${relative(SRC, file)}:${index + 1}`] : [];
    }));
    expect(offenders).toEqual([]);
  });

  it('the scan catches every spelling', () => {
    for (const line of ["{redirect:'error'}", '{ redirect: "error" }', '{redirect : `error`}']) expect(USES_ERROR.test(line)).toBe(true);
    expect(USES_ERROR.test("{redirect:'manual'}")).toBe(false);
  });
});
