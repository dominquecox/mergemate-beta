import path from 'node:path';
import { lstat, realpath, readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export class AgentError extends Error {
  constructor(code, message, status = 'blocked') { super(message); this.code = code; this.status = status; }
}
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const REPOSITORY = /^[a-z\d][a-z\d-]{0,38}\/[a-z\d_.-]{1,100}$/i;
export const SHA = /^[a-f\d]{40}$/i;
const ID = /^[a-z\d_-]{1,100}$/i;
const PROTECTED = /(^|\/)(?:\.git(?:hub)?|\.mergemate|node_modules|migrations?|auth|oauth|session|token|crypto|billing|payments?|secrets?|credentials?|keychain|deploy(?:ment)?s?)(?:\/|[._-]|$)|(?:AuthContext|auth[-_.]?|oauth|session|token|credential|secret|wrangler|app\.config|package(?:-lock)?\.json|tsconfig|eas\.json|dockerfile|compose\.ya?ml)/i;
const SOURCE_EXT = /\.(?:[cm]?[jt]sx?|css|md)$/i;
export function safeRelative(file) {
  if (typeof file !== 'string' || !file || file.length > 240 || file.includes('\\') || /[\x00-\x1f\x7f]/.test(file) || path.posix.isAbsolute(file) || file.split('/').some(part => !part || part === '.' || part === '..') || path.posix.normalize(file) !== file) throw new AgentError('unsafe_path', 'Patch contains an unsafe file path.');
  return file;
}
export function allowedPath(file, policy) {
  safeRelative(file);
  if (!SOURCE_EXT.test(file)) return false;
  if (!policy.allowedRoots.some(root => file.startsWith(`${root}/`))) return false;
  return !PROTECTED.test(file) || policy.protectedPathExceptions.includes(file);
}
export function validateConfig(input) {
  if (!input || typeof input !== 'object') throw new AgentError('invalid_config', 'Runner configuration is required.');
  let origin; try { origin = new URL(input.serverOrigin); } catch { throw new AgentError('invalid_config', 'A valid workflow API origin is required.'); }
  if (origin.origin !== input.serverOrigin || origin.username || origin.password || !(origin.protocol === 'https:' || input.allowLocal === true && origin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname))) throw new AgentError('invalid_config', 'Runner API must use HTTPS (or explicitly enabled local fixtures).');
  if (!Array.isArray(input.repositories) || !input.repositories.length || input.repositories.length > 10 || input.repositories.some(repo => typeof repo !== 'string' || !REPOSITORY.test(repo) || [".", ".."].includes(repo.split("/")[1]))) throw new AgentError('invalid_config', 'Configure a bounded repository allowlist.');
  if (typeof input.image !== 'string' || !/^[a-z\d][a-z\d./:_-]*@sha256:[a-f\d]{64}$/i.test(input.image)) throw new AgentError('unpinned_image', 'Use a reviewed Docker image pinned by SHA-256 digest.');
  const roots = input.allowedRoots ?? ['apps/mobile/src', 'apps/mobile/app', 'apps/web/src', 'packages/contracts/src', 'apps/mobile/test', 'apps/web/test', 'packages/contracts/test'];
  if (!Array.isArray(roots) || !roots.length || roots.length > 20) throw new AgentError('invalid_config', 'Configure bounded source roots.');
  roots.forEach(safeRelative);
  const exceptions = input.protectedPathExceptions ?? []; if (!Array.isArray(exceptions) || exceptions.length > 20) throw new AgentError('invalid_config', 'Invalid protected path exceptions.'); exceptions.forEach(safeRelative);
  if (!Array.isArray(input.tests) || !input.tests.length || input.tests.length > 6) throw new AgentError('invalid_config', 'At least one trusted test command is required.');
  for (const command of input.tests) if (!Array.isArray(command) || command.length < 2 || command.length > 20 || !['npm', 'node'].includes(command[0]) || command.some(arg => typeof arg !== 'string' || !arg || arg.length > 160 || /[\x00-\x1f\x7f]/.test(arg))) throw new AgentError('invalid_config', 'Test commands must be bounded argv arrays using npm or node; no shell.');
  const bounds = { maxFiles: 8, maxPatchBytes: 131072, maxArchiveBytes: 16777216, maxCheckoutBytes: 268435456, maxCheckoutEntries: 20000, maxContextBytes: 98304, timeoutMs: 600000, installTimeoutMs: 300000, maxOutputBytes: 1048576, memoryMb: 3072, maxSandboxMb: 2048, cpus: 2, pollMs: 5000 };
  const ceiling = { maxFiles: 8, maxPatchBytes: 131072, maxArchiveBytes: 33554432, maxCheckoutBytes: 536870912, maxCheckoutEntries: 30000, maxContextBytes: 131072, timeoutMs: 900000, installTimeoutMs: 600000, maxOutputBytes: 2097152, memoryMb: 8192, maxSandboxMb: 4096, cpus: 4, pollMs: 60000 };
  for (const key of Object.keys(bounds)) if (input[key] !== undefined) { if (!Number.isInteger(input[key]) || input[key] < 1 || input[key] > ceiling[key]) throw new AgentError('invalid_config', `Invalid ${key} bound.`); bounds[key] = input[key]; }
  const runnerId = input.runnerId ?? `runner-${process.pid}`;
  if (typeof runnerId !== 'string' || !ID.test(runnerId)) throw new AgentError('invalid_config', 'Invalid runner identity.');
  return { ...bounds, serverOrigin: origin.origin, repositories: [...new Set(input.repositories.map(r => r.toLowerCase()))], image: input.image, allowedRoots: roots, protectedPathExceptions: exceptions, tests: input.tests.map(c => [...c]), runnerId };
}
export function validateJob(job, policy) {
  if (!job || !ID.test(job.id ?? '') || !ID.test(job.runId ?? '') || !['patch','qa'].includes(job.stage) || job.githubAccessToken!==undefined || job.githubTokenExpiresAt!==undefined || job.githubWriteAllowed!==undefined || typeof job.leaseToken !== 'string' || job.leaseToken.length < 16 || job.leaseToken.length > 512 || !Number.isSafeInteger(job.repositoryId) || job.repositoryId < 1 || !REPOSITORY.test(job.repository ?? '') || !policy.repositories.includes(job.repository.toLowerCase()) || !SHA.test(job.baseSha ?? '') || !['pull_request', 'issue', 'repository'].includes(job.targetKind ?? (job.targetPr ? 'pull_request' : 'repository')) || (job.targetPr !== undefined && (!Number.isSafeInteger(job.targetPr) || job.targetPr < 1)) || (job.targetNumber !== undefined && (!Number.isSafeInteger(job.targetNumber) || job.targetNumber < 1)) || typeof job.intent !== 'string' || !job.intent.trim() || job.intent.length > 4000 || !Number.isFinite(Date.parse(job.leaseExpiresAt)) || Date.parse(job.leaseExpiresAt) <= Date.now()) throw new AgentError('invalid_job', 'Job identity, repository, commit or lease is invalid.');
  rejectSecrets(job.intent);
  const targetKind = job.targetKind ?? (job.targetPr ? 'pull_request' : 'repository'), targetNumber = job.targetNumber ?? job.targetPr;
  if (targetKind !== 'repository' && !Number.isSafeInteger(targetNumber) || job.targetPr !== undefined && job.targetNumber !== undefined && job.targetPr !== job.targetNumber) throw new AgentError('invalid_job', 'Target number is missing or inconsistent.');
  if (job.limits !== undefined && (!job.limits || typeof job.limits !== 'object' || ['maxFiles', 'maxPatchBytes'].some(key => job.limits[key] !== undefined && (!Number.isInteger(job.limits[key]) || job.limits[key] < 1)))) throw new AgentError('invalid_job', 'Job limits must be positive integers.');
  if (job.stage === 'qa' && (!job.approvedPatch || typeof job.approvedPatch !== 'object' || !Array.isArray(job.approvedPatch.changes) || !/^[a-f\d]{64}$/i.test(job.patchHash ?? ''))) throw new AgentError('invalid_job', 'QA requires an exact approved patch binding.');
  return { ...job, targetKind, targetNumber, repository: job.repository.toLowerCase() };
}
export async function withinWorkspace(root, relative, { mayCreate = false } = {}) {
  safeRelative(relative); const base = await realpath(root); let current = base; const parts = relative.split('/');
  for (let index = 0; index < parts.length; index++) {
    current = path.join(current, parts[index]); let info;
    try { info = await lstat(current); } catch (error) { if (error.code === 'ENOENT' && mayCreate) return path.join(base, ...parts); throw error; }
    if (info.isSymbolicLink() || index < parts.length - 1 && !info.isDirectory()) throw new AgentError('unsafe_path', 'Symlinks and non-directory path parents are not patchable.');
  }
  if (!current.startsWith(`${base}${path.sep}`)) throw new AgentError('unsafe_path', 'Path leaves the isolated checkout.');
  return current;
}
export function rejectSecrets(content) {
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bgh[pousr]_[A-Za-z\d]{30,}|\bgithub_pat_[A-Za-z\d_]{40,}|\bAKIA[A-Z\d]{16}\b/.test(content)) throw new AgentError('secret_detected', 'Potential credentials in source or generated patch; refusing transfer/publication.');
}
export async function validateChanges(root, changes, policy, jobLimits = {}) {
  const maxFiles = Math.min(policy.maxFiles, jobLimits.maxFiles ?? policy.maxFiles), maxBytes = Math.min(policy.maxPatchBytes, jobLimits.maxPatchBytes ?? policy.maxPatchBytes);
  if (!Array.isArray(changes) || !changes.length || changes.length > maxFiles) throw new AgentError('invalid_patch', 'Patch file count is outside policy.');
  let bytes = 0; const seen = new Set();
  for (const change of changes) {
    if (!change || !allowedPath(change.path, policy) || seen.has(change.path) || typeof change.content !== 'string') throw new AgentError('invalid_patch', 'Patch paths/content violate trusted policy.');
    seen.add(change.path); bytes += Buffer.byteLength(change.content); if (bytes > maxBytes) throw new AgentError('invalid_patch', 'Patch exceeds byte limit.');
    rejectSecrets(change.content); await withinWorkspace(root, change.path, { mayCreate: true });
  }
  return { changes: changes.map(c => ({ path: c.path, content: c.content })), patchHash: sha256(JSON.stringify(changes.map(c => ({ path: c.path, content: c.content })))) };
}
export async function selectContext(root, policy, intent) {
  const candidates = []; let visited = 0;
  const words = [...new Set(intent.toLowerCase().match(/[a-z][a-z\d_-]{3,}/g) ?? [])].slice(0, 30);
  async function walk(directory, prefix = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (++visited > 12000) throw new AgentError('checkout_limit', 'Checkout exceeds file traversal limit.');
      const file = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink() || ['.git', 'node_modules', '.expo', 'dist', 'build'].includes(entry.name)) continue;
      if (entry.isDirectory()) await walk(path.join(directory, entry.name), file);
      else if (entry.isFile() && allowedPath(file, policy)) candidates.push({ path: file, score: words.reduce((sum, word) => sum + (file.toLowerCase().includes(word) ? 1 : 0), 0) });
    }
  }
  await walk(root); candidates.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  const result = []; let bytes = 0;
  for (const item of candidates.slice(0, 80)) {
    const file = await withinWorkspace(root, item.path), info = await lstat(file); if (info.size > 20000) continue;
    const content = await readFile(file, 'utf8'); if (content.includes('\0')) continue;
    try { rejectSecrets(content); } catch { continue; }
    const size = Buffer.byteLength(content); if (bytes + size > policy.maxContextBytes) continue;
    bytes += size; result.push({ path: item.path, content }); if (result.length >= 8) break;
  }
  if (!result.length) throw new AgentError('no_context', 'No permitted source context is available.');
  return result;
}

export async function limitedResponseText(response, maxBytes) {
  const chunks = []; let size = 0;
  if (!response.body) return '';
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new AgentError('response_limit', 'Remote response exceeds the configured byte limit.'); }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, size).toString('utf8');
  } finally { reader.releaseLock(); }
}
