/* global process, console */
// Compares variable NAMES only (never values) across the code, .dev.vars.example and a local .dev.vars.
// Usage: npm run check:env -w @mergemate/api [-- --file path/to/.dev.vars]
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const apiDir = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Names the Worker reads: string-typed properties of the Env interface in src/env.ts. */
export const codeNames = (source) => {
  const body = source.slice(source.indexOf("export interface Env {"));
  const end = body.indexOf("\n}");
  return new Set([...body.slice(0, end).matchAll(/^\s+([A-Z][A-Z0-9_]*)\?: string;/gm)].map((m) => m[1]));
};

/** Names assigned in a dotenv-style file. Commented lines (# NAME=) are optional overrides. */
export const fileNames = (text) => {
  const set = new Set();
  const optional = new Set();
  for (const line of text.split(/\r?\n/)) {
    const active = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (active) set.add(active[1]);
    const commented = line.match(/^\s*#\s*([A-Z][A-Z0-9_]*)=\s*$/);
    if (commented) optional.add(commented[1]);
  }
  return { set, optional };
};

/** Only set while rotating; never required locally. */
export const ROTATION_ONLY = new Set(["GITHUB_WEBHOOK_SECRET_NEXT", "TOKEN_ENCRYPTION_KEY_PREVIOUS"]);

export const compare = ({ code, example, local }) => {
  const problems = [];
  const warnings = [];
  for (const name of example.set) if (!code.has(name)) problems.push(`.dev.vars.example lists ${name}, which the code never reads`);
  for (const name of example.optional) if (!code.has(name)) problems.push(`.dev.vars.example mentions ${name}, which the code never reads`);
  if (local) {
    for (const name of local.set) {
      if (!code.has(name)) problems.push(`.dev.vars has ${name}, which the code never reads (wrong name?)`);
    }
    for (const name of example.set) {
      if (!local.set.has(name) && !ROTATION_ONLY.has(name)) warnings.push(`.dev.vars is missing ${name}`);
    }
  }
  return { problems, warnings };
};

const main = () => {
  const args = process.argv.slice(2);
  const fileArg = args.indexOf("--file");
  const localPath = fileArg >= 0 ? args[fileArg + 1] : join(apiDir, ".dev.vars");
  const code = codeNames(readFileSync(join(apiDir, "src/env.ts"), "utf8"));
  const example = fileNames(readFileSync(join(apiDir, ".dev.vars.example"), "utf8"));
  const local = existsSync(localPath) ? fileNames(readFileSync(localPath, "utf8")) : null;
  const { problems, warnings } = compare({ code, example, local });
  if (!local) console.log(`No local file at ${localPath}; checked .dev.vars.example against the code only.`);
  for (const w of warnings) console.log(`warn: ${w}`);
  for (const p of problems) console.log(`FAIL: ${p}`);
  if (problems.length) process.exit(1);
  console.log(`PASS: variable names match (${code.size} names in code).`);
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
