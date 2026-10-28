import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const output = mkdtempSync(join(tmpdir(), 'mergemate-secrets-'));
const bundleDirectory = process.argv[2];
const steps = [
  ['source', ['dir', '.']],
  ['history', ['git', '.', '--log-opts=HEAD']],
  ...(bundleDirectory ? [['bundles', ['dir', bundleDirectory]]] : []),
];
const results = [];
for (const [name, args] of steps) {
  const result = spawnSync('gitleaks', [...args, '--redact', '--no-banner', '--report-format', 'json', '--report-path', join(output, `${name}.json`)], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  writeFileSync(join(output, `${name}.log`), `${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  results.push({ name, exit: result.status, completed: !result.error && !result.signal && result.status !== null });
  if (result.status !== 0 || result.error || result.signal) process.exitCode = 1;
}
// Preserve every scanner result, including fixture matches. Human classification
// must not silently turn a nonzero history scan into a claim of a clean scan.
console.log(JSON.stringify({ output, results, bundleScanRequested: Boolean(bundleDirectory) }, null, 2));
