// Trusted helper mounted read-only into isolation. No model-supplied commands or host credentials.
import { cp, readFile, lstat, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const root = '/workspace';
const hash = value => createHash('sha256').update(value).digest('hex');
if (process.argv[2] === 'copy') {
  await cp('/source', root, { recursive: true, dereference: false, errorOnExist: true, force: false });
} else if (process.argv[2] === 'verify') {
  const manifest = JSON.parse(await readFile('/runner/manifest.json', 'utf8'));
  const known = new Set(manifest.files.map(file => file.path));
  for (const item of manifest.files) {
    let current = root;
    for (const part of item.path.split('/')) {
      current = path.join(current, part);
      if ((await lstat(current)).isSymbolicLink()) throw new Error('Tracked source became a symlink');
    }
    if (!(await lstat(current)).isFile() || hash(await readFile(current)) !== item.hash) throw new Error('Source changed during isolated tests');
  }
  let entries = 0;
  async function walk(directory, prefix = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (++entries > 30000) throw new Error('Post-test source entry budget exceeded');
      if (['node_modules', '.git', '.expo', 'dist', 'build', 'coverage', '.cache'].includes(entry.name)) continue;
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(path.join(directory, entry.name), name);
      else if (manifest.allowedRoots.some(base => name.startsWith(`${base}/`)) && !known.has(name)) throw new Error('Untracked source was introduced during tests');
    }
  }
  await walk(root);
} else throw new Error('Unknown trusted container operation');
