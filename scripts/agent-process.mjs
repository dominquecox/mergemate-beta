import { spawn } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sourceManifest } from './agent-manifest.mjs';
import { AgentError } from './agent-policy.mjs';

/** Never passes repository/model content to a shell. All executable/argv policy is trusted host configuration. */
export function runBounded(executable, args, { timeoutMs, maxOutputBytes, signal, cwd, env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new AgentError('cancelled', 'Job was cancelled.', 'cancelled'));
    const start = Date.now(), hash = createHash('sha256'); let bytes = 0, stopped = null, settled = false;
    const child = spawn(executable, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
    const kill = reason => { if (stopped) return; stopped = reason; try { if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); } catch {} };
    const cancel = () => kill('cancelled'); signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(() => kill('timeout'), timeoutMs ?? 60000);
    const consume = chunk => { bytes += chunk.length; hash.update(chunk); if (bytes > (maxOutputBytes ?? 1048576)) kill('output_limit'); };
    child.stdout.on('data', consume); child.stderr.on('data', consume);
    const done = (error, code, termination) => {
      if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener('abort', cancel);
      if (error) return reject(new AgentError('process_failed', 'Trusted runner executable could not start.'));
      const result = { exitCode: termination ? null : code, durationMs: Date.now() - start, outputHash: hash.digest('hex'), outputBytes: bytes };
      if (stopped) return reject(Object.assign(new AgentError(stopped, `Isolated process stopped: ${stopped}.`, stopped === 'cancelled' ? 'cancelled' : 'failed'), { evidence: result }));
      resolve(result);
    };
    child.once('error', error => done(error)); child.once('close', (code, termination) => done(null, code, termination));
  });
}

export class DockerExecutor {
  constructor(policy, { run = runBounded, uid = process.getuid?.() ?? 1000, gid = process.getgid?.() ?? 1000 } = {}) {
    this.policy = policy; this.run = run; this.uid = uid; this.gid = gid; this.containers = new Map();
    if (uid === 0) throw new AgentError('root_runner', 'Run the coding executor as a non-root host user.');
  }
  async available() {
    try { return (await this.run('docker', ['image', 'inspect', this.policy.image], { timeoutMs: 15000, maxOutputBytes: 65536 })).exitCode === 0; }
    catch { return false; }
  }
  limits(name, network = 'none') {
    return ['--name', name, '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--pids-limit', '128', '--memory', `${this.policy.memoryMb}m`, '--cpus', String(this.policy.cpus), '--user', `${this.uid}:${this.gid}`, '--network', network, '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,size=512m', '--env', 'HOME=/tmp/mergemate-home', '--env', 'npm_config_cache=/tmp/npm-cache', '--env', 'npm_config_update_notifier=false', '--env', 'CI=1'];
  }
  async checked(args, { signal, install = false, code = 'container_failed' } = {}) {
    const result = await this.run('docker', args, { timeoutMs: install ? this.policy.installTimeoutMs : this.policy.timeoutMs, maxOutputBytes: this.policy.maxOutputBytes, signal });
    if (result.exitCode !== 0) throw Object.assign(new AgentError(code, 'An isolated Docker operation failed.', 'failed'), { evidence: result });
    return result;
  }
  async remove(name) {
    try {
      const result = await this.run('docker', ['rm', '--force', name], { timeoutMs: 15000, maxOutputBytes: 16384 });
      if (result.exitCode !== 0) throw new Error('Removal was not confirmed');
    } catch { throw new AgentError('container_cleanup_failed', 'Could not confirm isolated container cleanup; stop this runner.'); }
  }
  async extract(workspace, archive, signal) {
    const name = `mergemate-extract-${randomUUID()}`; let failure;
    try {
      await this.checked(['run', ...this.limits(name), '--mount', `type=bind,source=${workspace},target=/workspace`, '--mount', `type=bind,source=${archive},target=/input/source.tar.gz,readonly`, '--workdir', '/workspace', this.policy.image, 'tar', '-xzf', '/input/source.tar.gz', '--strip-components=1', '--no-same-owner', '--no-same-permissions'], { signal, code: 'checkout_failed' });
    } catch (error) { failure = error; }
    await this.remove(name); if (failure) throw failure;
  }
  async install(workspace, signal) {
    const name = `mergemate-agent-${randomUUID()}`, manifestFile = path.join(path.dirname(workspace), 'source-manifest.json');
    await writeFile(manifestFile, JSON.stringify(await sourceManifest(workspace, this.policy)), { mode: 0o600, flag: 'wx' });
    const helper = fileURLToPath(new URL('./agent-container.mjs', import.meta.url));
    this.containers.set(workspace, { name, manifestFile });
    await this.checked(['create', ...this.limits(name, 'bridge'), '--tmpfs', `/workspace:rw,nosuid,nodev,mode=1777,size=${this.policy.maxSandboxMb}m`, '--mount', `type=bind,source=${workspace},target=/source,readonly`, '--mount', `type=bind,source=${manifestFile},target=/runner/manifest.json,readonly`, '--mount', `type=bind,source=${helper},target=/runner/helper.mjs,readonly`, '--workdir', '/workspace', this.policy.image, 'node', '-e', 'setInterval(()=>{},2147483647)'], { signal });
    await this.checked(['start', name], { signal });
    await this.checked(['exec', name, 'node', '/runner/helper.mjs', 'copy'], { signal });
    const result = await this.checked(['exec', name, 'npm', 'ci', '--ignore-scripts', '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org', '--userconfig=/dev/null', '--globalconfig=/dev/null'], { signal, install: true, code: 'dependencies_failed' });
    // No repository code executes until its network is removed. Dependencies were fetched with scripts disabled.
    await this.checked(['network', 'disconnect', 'bridge', name], { signal, code: 'network_isolation_failed' });
    return { command: 'npm ci --ignore-scripts --no-audit --no-fund', ...result };
  }
  async test(workspace, signal) {
    const container = this.containers.get(workspace); if (!container) throw new AgentError('container_missing', 'No isolated test workspace exists.');
    const results = [];
    for (const command of this.policy.tests) {
      if (signal?.aborted) throw new AgentError('cancelled', 'Job was cancelled.', 'cancelled');
      const result = await this.run('docker', ['exec', container.name, ...command], { timeoutMs: this.policy.timeoutMs, maxOutputBytes: this.policy.maxOutputBytes, signal });
      results.push({ command: command.join(' '), ...result });
      if (result.exitCode !== 0) throw Object.assign(new AgentError('tests_failed', 'An isolated test command failed; no PR will be created.', 'failed'), { tests: results });
    }
    await this.checked(['exec', container.name, 'node', '/runner/helper.mjs', 'verify'], { signal, code: 'changed_after_tests' });
    return results;
  }
  async cleanup(workspace) {
    const container = this.containers.get(workspace); if (!container) return;
    await this.remove(container.name); this.containers.delete(workspace); await rm(container.manifestFile, { force: true });
  }
}
