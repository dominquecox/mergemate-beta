import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Read generated native projects, never the stale app.json remote-counter seed.
export function nativeBuildNumber(root, platform) {
  if (platform === 'android') {
    const gradle = readFileSync(path.join(root, 'android/app/build.gradle'), 'utf8');
    const match = gradle.match(/\bversionCode\s+(\d+)/);
    if (match) return match[1];
  } else if (platform === 'ios') {
    for (const entry of readdirSync(path.join(root, 'ios'))) {
      if (!entry.endsWith('.xcodeproj')) continue;
      const project = readFileSync(path.join(root, 'ios', entry, 'project.pbxproj'), 'utf8');
      const values = [...project.matchAll(/CURRENT_PROJECT_VERSION\s*=\s*"?([\d.]+)"?\s*;/g)].map(match => match[1]);
      if (values.length && new Set(values).size === 1) return values[0];
    }
  }
  throw new Error(`Cannot identify generated ${platform} build number; retain native build logs for investigation`);
}

export function printReceipt(root, platform, env = process.env) {
  const commit = env.EAS_BUILD_GIT_COMMIT_HASH || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  if (!/^[a-f0-9]{40}$/i.test(commit)) throw new Error('Missing full source commit in native receipt');
  const app = JSON.parse(readFileSync(path.join(root, 'app.json'), 'utf8')).expo;
  const number = nativeBuildNumber(root, platform);
  console.log(`MergeMate native receipt: platform=${platform} version=${app.version} build=${number} commit=${commit}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  printReceipt(path.resolve(fileURLToPath(new URL('..', import.meta.url))), process.env.EAS_BUILD_PLATFORM);
}
