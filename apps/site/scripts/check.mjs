import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const commands = [
  ['node_modules/typescript/bin/tsc', '--project', 'apps/site/tsconfig.json', '--noEmit'],
  ['node_modules/eslint/bin/eslint.js', '--config', 'apps/site/eslint.config.mjs', 'apps/site/src'],
];
for (const args of [...commands, ['--check', 'apps/site/scripts/smoke.mjs'], ['apps/site/scripts/check-assets.mjs'], ['--test', 'apps/site/test/waitlist.test.mjs']]) {
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
