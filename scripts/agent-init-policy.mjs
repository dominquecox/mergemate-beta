#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateConfig } from './agent-policy.mjs';

/** Owner setup: inspect an already pulled image. Never pulls, runs containers, reads secrets or overwrites policy. */
export function initialPolicy(repository, { image = 'node:22-bookworm-slim', inspect = value => execFileSync('docker', ['image', 'inspect', '--format', '{{json .RepoDigests}}', value], { encoding: 'utf8', timeout: 15000, maxBuffer: 65536 }) } = {}) {
  const digests = JSON.parse(inspect(image));
  const pinned = Array.isArray(digests) ? digests.find(value => typeof value === 'string' && /^[a-z\d][a-z\d./:_-]*@sha256:[a-f\d]{64}$/i.test(value)) : null;
  if (!pinned) throw new Error('Pull and review the image first; Docker did not return a pinned digest.');
  return validateConfig({ serverOrigin: 'https://api-dev.mergemate.dev', repositories: [repository], image: pinned, runnerId: 'owner-coding-runner', tests: [['npm', 'run', 'typecheck'], ['npm', 'run', 'lint'], ['npm', 'test']] });
}
export async function initialize(args) {
  if (args.length !== 4 || args[0] !== '--repo' || args[2] !== '--output' || !path.isAbsolute(args[3])) throw new Error('Usage: node scripts/agent-init-policy.mjs --repo owner/repo --output /absolute/owner-policy.json');
  const policy = initialPolicy(args[1]);
  await mkdir(path.dirname(args[3]), { recursive: true, mode: 0o700 });
  await writeFile(args[3], `${JSON.stringify(policy, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  console.log(`Created owner policy ${args[3]}. Review repository, digest, source roots, resource bounds and tests before starting the runner.`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) initialize(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
