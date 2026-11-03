import { writeFile, readFile, lstat } from 'node:fs/promises';
import { AgentError, SHA, withinWorkspace } from './agent-policy.mjs';

const API = 'https://api.github.com';
function validBranch(value) { return typeof value === 'string' && value.length > 0 && value.length <= 180 && /^[a-z\d/_.-]+$/i.test(value) && !value.includes('..') && !value.includes('//') && !value.startsWith('/') && !value.endsWith('/') && !value.endsWith('.lock') && value.split('/').every(part => part && !part.startsWith('.') && !part.endsWith('.')); }
export class GitHubPublisher {
  constructor(token, { fetcher = fetch, timeoutMs = 60000, maxArchiveBytes = 67108864 } = {}) {
    if (!token || /[\r\n]/.test(token)) throw new AgentError('github_unconfigured', 'A host-only GitHub publishing credential is required.');
    this.token = token; this.fetcher = fetcher; this.timeoutMs = timeoutMs; this.maxArchiveBytes = maxArchiveBytes;
  }
  async request(route, { method = 'GET', body, signal } = {}) {
    const url = new URL(route, API); if (url.origin !== API) throw new AgentError('github_origin', 'GitHub API origin is pinned.');
    const response = await this.fetcher(url, { method, redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs)]) : AbortSignal.timeout(this.timeoutMs), headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${this.token}`, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'MergeMate-Agent-Executor', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) throw new AgentError('github_failed', `GitHub operation failed (${response.status}); no success inferred.`, response.status === 403 ? 'blocked' : 'failed');
    const raw = await response.text(); if (Buffer.byteLength(raw) > 2097152) throw new AgentError('github_response_limit', 'GitHub response exceeds limit.');
    try { return JSON.parse(raw); } catch { throw new AgentError('github_invalid_response', 'GitHub returned an invalid response.'); }
  }
  async verifyTarget(job, signal) {
    const repo = await this.request(`/repos/${job.repository}`, { signal });
    if (!(repo.permissions?.push || repo.permissions?.maintain || repo.permissions?.admin)) throw new AgentError('github_write_unavailable', 'Current GitHub credential does not prove repository write permission.');
    let branch = job.baseBranch ?? repo.default_branch;
    if (job.targetKind === 'pull_request') {
      const pr = await this.request(`/repos/${job.repository}/pulls/${job.targetNumber}`, { signal });
      if (pr.state !== 'open' || pr.head?.repo?.full_name?.toLowerCase() !== job.repository || pr.head?.sha !== job.baseSha) throw new AgentError('stale_target', 'Target PR closed, moved or is not a same-repository head.');
      branch = pr.head.ref;
    } else {
      if (job.targetKind === 'issue') {
        const issue = await this.request(`/repos/${job.repository}/issues/${job.targetNumber}`, { signal });
        if (issue.state !== 'open' || issue.pull_request) throw new AgentError('invalid_target', 'Target must be an open repository issue.');
      }
      if (!validBranch(branch)) throw new AgentError('invalid_branch', 'A valid pinned base branch is required.');
      const ref = await this.request(`/repos/${job.repository}/branches/${encodeURIComponent(branch)}`, { signal });
      if (ref.commit?.sha !== job.baseSha) throw new AgentError('stale_target', 'The pinned base branch moved.');
    }
    if (!validBranch(branch)) throw new AgentError('invalid_branch', 'Unsupported base branch name.');
    return branch;
  }
  async downloadArchive(job, destination, signal) {
    let url = new URL(`/repos/${job.repository}/tarball/${job.baseSha}`, API), response;
    for (let redirects = 0; redirects < 4; redirects++) {
      response = await this.fetcher(url, { redirect: 'manual', signal: AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs)]), headers: { 'User-Agent': 'MergeMate-Agent-Executor', ...(url.origin === API ? { Authorization: `Bearer ${this.token}` } : {}) } });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location'); if (!location) throw new AgentError('archive_failed', 'Archive redirect is missing.');
        url = new URL(location, url); if (url.protocol !== 'https:' || !['api.github.com', 'codeload.github.com'].includes(url.hostname) || url.username || url.password || url.port) throw new AgentError('archive_origin', 'Archive redirect left permitted GitHub origins.');
        continue;
      }
      break;
    }
    if (!response?.ok || !response.body) throw new AgentError('archive_failed', 'Pinned GitHub archive could not be fetched.');
    const chunks = []; let bytes = 0;
    for await (const chunk of response.body) { bytes += chunk.length; if (bytes > this.maxArchiveBytes) throw new AgentError('archive_limit', 'Archive exceeds configured byte limit.'); chunks.push(Buffer.from(chunk)); }
    await writeFile(destination, Buffer.concat(chunks), { mode: 0o600, flag: 'wx' });
  }
  async publish(job, root, changes, tests, patchHash, { assertActive, signal }) {
    if (!tests.length || tests.some(test => test.exitCode !== 0)) throw new AgentError('tests_required', 'Successful actual tests are required before publication.');
    const base = await this.verifyTarget(job, signal); await assertActive();
    const branch = `mergemate-agent/${job.runId}`;
    const tree = [];
    for (const change of changes) {
      const file = await withinWorkspace(root, change.path); if (!(await lstat(file)).isFile() || (await readFile(file, 'utf8')) !== change.content) throw new AgentError('changed_after_tests', 'Patch content changed during tests.');
      await assertActive();
      const blob = await this.request(`/repos/${job.repository}/git/blobs`, { method: 'POST', signal, body: { content: change.content, encoding: 'utf-8' } });
      if (!SHA.test(blob.sha ?? '')) throw new AgentError('github_invalid_response', 'GitHub did not return a blob identity.');
      tree.push({ path: change.path, mode: '100644', type: 'blob', sha: blob.sha });
    }
    await assertActive();
    const resultTree = await this.request(`/repos/${job.repository}/git/trees`, { method: 'POST', signal, body: { base_tree: job.baseSha, tree } });
    if (!SHA.test(resultTree.sha ?? '')) throw new AgentError('github_invalid_response', 'GitHub did not return a tree identity.');
    await assertActive();
    const commit = await this.request(`/repos/${job.repository}/git/commits`, { method: 'POST', signal, body: { message: `fix: agent task ${job.runId}`, tree: resultTree.sha, parents: [job.baseSha] } });
    if (!SHA.test(commit.sha ?? '')) throw new AgentError('github_invalid_response', 'GitHub did not return a commit identity.');
    // Ref creation is never forced, and cancellation/head checks happen before every visible write.
    await this.verifyTarget(job, signal); await assertActive();
    await this.request(`/repos/${job.repository}/git/refs`, { method: 'POST', signal, body: { ref: `refs/heads/${branch}`, sha: commit.sha } });
    await this.verifyTarget(job, signal); await assertActive();
    const pr = await this.request(`/repos/${job.repository}/pulls`, { method: 'POST', signal, body: { title: `Agent fix: ${job.intent.slice(0, 100).replace(/[\r\n]/g, ' ')}`, head: branch, base, draft: true, body: `Automated code-fix workflow ${job.runId}.\n\nPinned source: ${job.baseSha}\nPatch SHA-256: ${patchHash}\n\nIsolated tests:\n${tests.map(test => `- ${test.command}: exit ${test.exitCode} (${test.durationMs}ms), output SHA-256 ${test.outputHash}`).join('\n')}\n\nThis draft requires human review. No merge was performed.` } });
    const url = new URL(pr.html_url ?? 'https://invalid.test');
    if (url.origin !== 'https://github.com' || !url.pathname.toLowerCase().startsWith(`/${job.repository}/pull/`) || pr.draft !== true || pr.head?.sha !== commit.sha) throw new AgentError('github_invalid_response', 'Draft PR response could not be verified.');
    return { commitSha: commit.sha, draftPrUrl: url.href, branch };
  }
}
