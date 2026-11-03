#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { AgentError, validateConfig } from './agent-policy.mjs';
import { WorkflowBridge } from './agent-bridge.mjs';
import { GitHubPublisher } from './agent-github.mjs';
import { DockerExecutor } from './agent-process.mjs';
import { executeJob } from './agent-runner.mjs';

export async function main(args = process.argv.slice(2), env = process.env) {
  const position = args.indexOf('--config');
  if (position < 0 || !args[position + 1] || args.some((arg, index) => index !== position && index !== position + 1 && !['--once', '--check'].includes(arg))) throw new AgentError('usage', 'Usage: node scripts/agent-executor.mjs --config /absolute/trusted-policy.json [--once|--check]');
  const configPath = path.resolve(args[position + 1]);
  const policy = validateConfig(JSON.parse(await readFile(configPath, 'utf8')));
  const bridge = new WorkflowBridge(policy, env.MERGEMATE_RUNNER_TOKEN);
  const github = new GitHubPublisher(env.GITHUB_TOKEN, { maxArchiveBytes: policy.maxArchiveBytes });
  const docker = new DockerExecutor(policy);
  const available = await docker.available();
  await bridge.heartbeat({ docker: available, patch: available, qa: available, draftPr: available });
  if (!available) throw new AgentError('docker_unavailable', 'Docker and the reviewed digest-pinned image must be available.');
  if (args.includes('--check')) { console.log(JSON.stringify({ status: 'configured', repositories: policy.repositories, imagePinned: true, note: 'Per-job repository write permission is checked before execution.' })); return 0; }
  const abort = new AbortController(); const stop = () => abort.abort(); process.once('SIGINT', stop); process.once('SIGTERM', stop);
  const heartbeat = setInterval(() => { void bridge.heartbeat({ docker: true, patch: true, qa: true, draftPr: true }, abort.signal).catch(() => abort.abort()); }, 30000);
  try {
    do {
      if (abort.signal.aborted) break;
      const job = await bridge.claim(abort.signal);
      if (job) {
        const result = await executeJob(job, { policy, bridge, github, docker, signal: abort.signal });
        console.log(JSON.stringify({ jobId: job.id, status: result.status, stage: result.stage, code: result.code, ...(result.evidence.draftPrUrl ? { draftPrUrl: result.evidence.draftPrUrl } : {}) }));
        if (args.includes('--once')) return result.status === 'succeeded' ? 0 : 2;
        if (result.code === 'container_cleanup_failed') throw new AgentError(result.code, 'Stop runner: container cleanup could not be confirmed.');
      } else if (args.includes('--once')) { console.log(JSON.stringify({ status: 'idle' })); return 0; }
      await new Promise(resolve => { const timer = setTimeout(resolve, policy.pollMs); abort.signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true }); });
    } while (!abort.signal.aborted);
    return 0;
  } finally { clearInterval(heartbeat); process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(code => { process.exitCode = code; }).catch(error => { console.error(JSON.stringify({ status: error instanceof AgentError ? error.status : 'failed', code: error instanceof AgentError ? error.code : 'runner_failed', message: error instanceof AgentError ? error.message : 'Runner failed; inspect trusted local setup.' })); process.exitCode = 2; });
}
