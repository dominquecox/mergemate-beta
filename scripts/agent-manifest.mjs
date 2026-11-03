import { readdir, lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { AgentError, withinWorkspace, sha256 } from './agent-policy.mjs';

export async function sourceManifest(root, policy) {
  const files = []; let entries = 0, bytes = 0;
  async function walk(directory, prefix = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (['node_modules', '.git'].includes(entry.name)) continue;
      if (++entries > policy.maxCheckoutEntries) throw new AgentError('checkout_limit', 'Source manifest entry budget exceeded.');
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new AgentError('unsafe_path', 'Source manifest refuses symlinks.');
      if (entry.isDirectory()) await walk(path.join(directory, entry.name), name);
      else if (entry.isFile()) {
        const file = await withinWorkspace(root, name), info = await lstat(file); bytes += info.size;
        if (bytes > policy.maxCheckoutBytes) throw new AgentError('checkout_limit', 'Source manifest byte budget exceeded.');
        files.push({ path: name, hash: sha256(await readFile(file)) });
      } else throw new AgentError('unsafe_path', 'Source manifest refuses special files.');
    }
  }
  await walk(root); files.sort((a, b) => a.path.localeCompare(b.path));
  return { files, hash: sha256(JSON.stringify(files)), allowedRoots: policy.allowedRoots };
}
