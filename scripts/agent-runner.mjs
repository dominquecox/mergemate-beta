import { mkdtemp, mkdir, rm, readFile, writeFile, readdir, lstat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { constants } from 'node:fs';
import { AgentError, validateJob, validateChanges, selectContext, withinWorkspace, sha256, safeRelative } from './agent-policy.mjs';
import { validateArchive } from './agent-archive.mjs';
import { LeaseGuard } from './agent-bridge.mjs';

export async function validateDependencyPolicy(root) {
  const lock = await withinWorkspace(root, 'package-lock.json');
  if ((await lstat(lock)).size > 4194304) throw new AgentError('lockfile_limit', 'Dependency lock exceeds policy.');
  let value; try { value = JSON.parse(await readFile(lock, 'utf8')); } catch { throw new AgentError('lockfile_required', 'A valid npm lockfile is required for isolated tests.'); }
  if (!value.packages || ![2, 3].includes(value.lockfileVersion)) throw new AgentError('lockfile_required', 'npm lockfileVersion2/3 is required.');
  for (const entry of Object.values(value.packages)) {
    if (!entry || typeof entry !== 'object' || !entry.resolved) continue;
    if (entry.link === true) { safeRelative(entry.resolved); continue; }
    let url; try { url = new URL(entry.resolved); } catch { throw new AgentError('dependency_origin', 'Only pinned npm registry dependencies are supported.'); }
    if (url.protocol !== 'https:' || url.hostname !== 'registry.npmjs.org' || url.username || url.password || url.port) throw new AgentError('dependency_origin', 'Dependency lock contains a non-permitted registry origin.');
    if (typeof entry.integrity !== 'string' || !/^sha(?:256|384|512)-[A-Za-z\d+/=]+$/.test(entry.integrity)) throw new AgentError('dependency_integrity', 'Registry dependencies require integrity hashes.');
  }
  let visited = 0;
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (++visited > 12000) throw new AgentError('checkout_limit', 'Checkout exceeds traversal limit.');
      if (entry.name === '.npmrc' || entry.name === 'npm-shrinkwrap.json') throw new AgentError('dependency_configuration', 'Repository npm configuration/shrinkwrap is not allowed by the isolated policy.');
      if (entry.isDirectory() && !['node_modules', '.git'].includes(entry.name)) await walk(path.join(directory, entry.name));
    }
  }
  await walk(root);
}

/** Dependency injection makes every host/network/container boundary adversarially testable. */
export async function executeJob(rawJob, { policy, bridge, github, docker, signal, makeGuard = (job, s) => new LeaseGuard(bridge, job, s), tempRoot = os.tmpdir() }) {
  const job = validateJob(rawJob, policy), guard = makeGuard(job, signal); let temporary, stage = 'patch', evidence = { baseSha: job.baseSha }, outcome;
  const progress = async (currentStage, extra) => { await guard.assertActive(); await bridge.jobOperation(job, 'report', { status: 'succeeded', stage: currentStage, evidence: { ...evidence, ...extra } }, guard.signal); };
  try {
    await guard.assertActive();
    if (!await docker.available()) throw new AgentError('docker_unavailable', 'The reviewed digest-pinned Docker image is not installed or Docker is unavailable.');
    await github.verifyTarget(job, guard.signal);
    temporary = await mkdtemp(path.join(tempRoot, 'mergemate-agent-')); const workspace = path.join(temporary, 'workspace'), archive = path.join(temporary, 'source.tar.gz'); await mkdir(workspace, { mode: 0o700 });
    await github.downloadArchive(job, archive, guard.signal); await validateArchive(archive, policy); await guard.assertActive(); await docker.extract(workspace, archive, guard.signal);
    await validateDependencyPolicy(workspace);
    const files = await selectContext(workspace, policy, job.intent); await guard.assertActive();
    const result = await bridge.jobOperation(job, 'patch', { files }, guard.signal);
    const validated = await validateChanges(workspace, result.changes, policy, job.limits);
    // The host writes data only into its private scratch checkout; no repository command executes here.
    for (const change of validated.changes) {
      const target = await withinWorkspace(workspace, change.path, { mayCreate: true });
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, change.content, { flag: constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW, mode: 0o600 });
    }
    evidence.patchHash = validated.patchHash; evidence.summary = `Validated patch: ${validated.changes.length} source file(s).`;
    await progress('patch'); stage = 'qa';
    await guard.assertActive(); await docker.install(workspace, guard.signal);
    const tests = await docker.test(workspace, guard.signal);
    evidence.tests = tests.map(({ command, exitCode, durationMs, outputHash }) => ({ command, exitCode, durationMs, outputHash }));
    if (!evidence.tests.length || evidence.tests.some(test => test.exitCode !== 0)) throw new AgentError('tests_failed', 'Actual isolated tests did not pass.', 'failed');
    // Tests may mutate files or npm configuration; publication reads only unchanged validated patch data.
    await validateChanges(workspace, validated.changes, policy, job.limits);
    for (const change of validated.changes) if (sha256(await readFile(await withinWorkspace(workspace, change.path))) !== sha256(change.content)) throw new AgentError('changed_after_tests', 'Source changed during tests; refusing publication.');
    await progress('qa'); stage = 'draft_pr'; await guard.assertActive();
    const published = await github.publish(job, workspace, validated.changes, evidence.tests, validated.patchHash, { signal: guard.signal, assertActive: () => guard.assertActive() });
    evidence = { ...evidence, commitSha: published.commitSha, draftPrUrl: published.draftPrUrl, summary: 'Patch validated, isolated tests passed, draft PR created. Human review required.' };
    await progress('draft_pr'); outcome = { status: 'succeeded', stage, evidence };
  } catch (error) {
    const status = guard.signal.aborted ? 'cancelled' : error instanceof AgentError ? error.status : 'failed';
    if (error.tests) evidence.tests = error.tests.map(({ command, exitCode, durationMs, outputHash }) => ({ command, exitCode, durationMs, outputHash }));
    outcome = { status, stage, evidence: { ...evidence, summary: error instanceof AgentError ? error.message : 'Executor failed; inspect local configuration without exposing credentials.' }, code: error instanceof AgentError ? error.code : 'executor_failed' };
    try { await bridge.jobOperation(job, 'report', { status, stage, evidence: outcome.evidence }); } catch { outcome.reportAccepted = false; }
  } finally {
    guard.stop();
    if (temporary) await rm(temporary, { recursive: true, force: true });
  }
  return outcome;
}
