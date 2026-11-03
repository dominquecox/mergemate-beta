import { spawn } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
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
    this.policy = policy; this.run = run; this.uid = uid; this.gid = gid;
    if (uid === 0) throw new AgentError('root_runner', 'Run the coding executor as a non-root host user.');
  }
  async available() {
    try {
      const result = await this.run('docker', ['image', 'inspect', this.policy.image], { timeoutMs: 15000, maxOutputBytes: 65536 });
      return result.exitCode === 0;
    } catch { return false; }
  }
  async execute(workspace, command, { archive, install = false, signal } = {}) {
    const name = `mergemate-agent-${randomUUID()}`;
    const args = ['run', '--rm', '--name', name, '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--pids-limit', '128', '--memory', `${this.policy.memoryMb}m`, '--cpus', String(this.policy.cpus), '--user', `${this.uid}:${this.gid}`, '--network', install ? 'bridge' : 'none', '--tmpfs', '/tmp:rw,noexec,nosuid,size=512m', '--mount', `type=bind,source=${workspace},target=/workspace`, '--workdir', '/workspace', '--env', 'HOME=/tmp/mergemate-home', '--env', 'npm_config_cache=/tmp/npm-cache', '--env', 'npm_config_update_notifier=false', '--env', 'CI=1'];
    if (archive) args.push('--mount', `type=bind,source=${archive},target=/input/source.tar.gz,readonly`);
    args.push(this.policy.image, ...command);
    let result, failure;
    try { result = await this.run('docker', args, { timeoutMs: install ? this.policy.installTimeoutMs : this.policy.timeoutMs, maxOutputBytes: this.policy.maxOutputBytes, signal }); }
    catch (error) { failure = error; }
    // A killed Docker client can leave a container running: removal is mandatory even after an abort.
    try { await this.run('docker', ['rm', '--force', name], { timeoutMs: 15000, maxOutputBytes: 16384 }); }
    catch { throw new AgentError('container_cleanup_failed', 'Could not confirm isolated container cleanup; stop this runner.'); }
    if (failure) throw failure;
    return result;
  }
  async extract(workspace, archive, signal) {
    const result = await this.execute(workspace, ['tar', '-xzf', '/input/source.tar.gz', '--strip-components=1', '--no-same-owner', '--no-same-permissions'], { archive, signal });
    if (result.exitCode !== 0) throw new AgentError('checkout_failed', 'Pinned source could not be extracted inside isolation.');
  }
  async install(workspace, signal) {
    const result = await this.execute(workspace, ['npm', 'ci', '--ignore-scripts', '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org', '--userconfig=/dev/null', '--globalconfig=/dev/null'], { install: true, signal });
    if (result.exitCode !== 0) throw new AgentError('dependencies_failed', 'Isolated dependency installation failed.', 'failed');
    return { command: 'npm ci --ignore-scripts --no-audit --no-fund', ...result };
  }
  async test(workspace, signal) {
    const results = [];
    for (const command of this.policy.tests) {
      if (signal.aborted) throw new AgentError('cancelled', 'Job was cancelled.', 'cancelled');
      const result = await this.execute(workspace, command, { signal }); results.push({ command: command.join(' '), ...result });
      if (result.exitCode !== 0) throw Object.assign(new AgentError('tests_failed', 'An isolated test command failed; no PR will be created.', 'failed'), { tests: results });
    }
    return results;
  }
}
