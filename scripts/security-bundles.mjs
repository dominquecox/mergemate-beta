import { assessBundle, hasUnknownHigh } from "./security-evidence.mjs";
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = mkdtempSync(join(tmpdir(), 'mergemate-security-'));
const steps = [];
function run(name, args, extraEnv = {}) {
  const result = spawnSync('npm', args, { cwd: root, env: { ...process.env, ...extraEnv }, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  writeFileSync(join(output, `${name}.log`), `${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  if (result.error || result.signal || result.status === null) throw new Error(`${name} could not complete`);
  steps.push({ name, exit: result.status });
  return result;
}
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)]);
}
function sources(map) {
  return [...(map.sources ?? []), ...(map.sections ?? []).flatMap(section => sources(section.map))];
}
const evidence = { generatedAt: new Date().toISOString(), steps, bundles: [], audits: {}, finding: 'unassessed' };
try {
  for (const [scope, args] of [['all', []], ['runtime', ['--omit=dev']]]) {
    const result = run(`audit-${scope}`, ['audit', ...args, '--json']);
    if (![0, 1].includes(result.status)) throw new Error(`audit-${scope} failed`);
    const audit = JSON.parse(result.stdout);
    if (audit.error || !audit.metadata?.vulnerabilities) throw new Error(`audit-${scope} returned no usable assessment`);
    writeFileSync(join(output, `audit-${scope}.json`), result.stdout);
    evidence.audits[scope] = { exit: result.status, counts: audit.metadata.vulnerabilities,
      findings: Object.entries(audit.vulnerabilities ?? {}).map(([name, v]) => ({ name, severity: v.severity, nodes: v.nodes,
        advisories: v.via.filter(item => typeof item === 'object').map(item => ({ url: item.url, range: item.range })) })) };
  }
  const meta = join(output, 'api-meta.json');
  if (run('api', ['exec', '-w', '@mergemate/api', '--', 'wrangler', 'deploy', '--dry-run', '--env', 'production', '--outdir', join(output, 'api'), '--metafile', meta]).status !== 0) throw new Error('API build failed');
  evidence.bundles.push({ platform: 'api', sources: Object.keys(JSON.parse(readFileSync(meta)).inputs) });
  for (const platform of ['web', 'ios', 'android']) {
    const dir = join(output, platform);
    const result = run(platform, ['exec', '-w', '@mergemate/mobile', '--', 'expo', 'export', '--platform', platform, '--source-maps', '--no-bytecode', '--output-dir', dir], { EXPO_NO_TELEMETRY: '1' });
    if (result.status !== 0) throw new Error(`${platform} export failed`);
    const maps = files(dir).filter(file => file.endsWith('.map'));
    if (!maps.length) throw new Error(`${platform} export has no source-map evidence`);
    evidence.bundles.push({ platform, sources: maps.flatMap(file => sources(JSON.parse(readFileSync(file)))) });
  }
  // Compare all installed audited package paths with actual build inputs. This does
  // not relabel npm's tooling findings as clean or approve unknown future advisories.
  const findings = evidence.audits.all.findings;
  evidence.bundles = evidence.bundles.map(bundle => assessBundle(bundle.platform, bundle.sources, findings));
  const unknownHigh = hasUnknownHigh(findings);
  const shippedVulnerable = evidence.bundles.some(bundle => bundle.affectedPackages.length);
  evidence.finding = shippedVulnerable ? 'affected dependency ships' : unknownHigh ? 'new high finding requires assessment' : 'reported affected dependencies absent from inspected bundles; tooling audit remains open';
  if (shippedVulnerable || unknownHigh) process.exitCode = 1;
} catch (error) {
  evidence.finding = error.message;
  process.exitCode = 1;
} finally {
  writeFileSync(join(output, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify({ output, ...evidence }, null, 2));
}
