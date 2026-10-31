/* global process, console, fetch, FormData, Blob */
// One-command live check of Clef (risk classifier) and SAM 3.1 (Highlight boxes) on the DEV API only.
//
//   MERGEMATE_DEV_COOKIE='<your dev Cookie header>' npm run check:dev-ai -w @mergemate/api -- --pr owner/repo#12 --image ~/Desktop/failing-ci.png
//
// The cookie is your own signed-in dev session (browser DevTools, Network tab, any api-dev.mergemate.dev request,
// Request Headers, Cookie). It is read from the environment, never stored, never printed, and never sent anywhere
// but api-dev.mergemate.dev. Either flag may be left out to run only the other check.
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

const API = "https://api-dev.mergemate.dev";
const cookie = process.env.MERGEMATE_DEV_COOKIE?.trim();
if (!cookie) {
  console.error("Set MERGEMATE_DEV_COOKIE to your signed-in dev Cookie header (see the top of this file).");
  process.exit(2);
}

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const pr = flag("--pr");
const image = flag("--image");
if (!pr && !image) {
  console.error("Give --pr owner/repo#number, --image path/to/screenshot.png, or both.");
  process.exit(2);
}

const call = async (path, init = {}) => {
  const res = await fetch(API + path, { ...init, headers: { cookie, ...(init.headers ?? {}) } });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 200);
  }
  return { status: res.status, body };
};

let failed = false;
const report = (name, ok, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`);
  if (!ok) failed = true;
};

const csrf = await call("/v1/auth/csrf");
if (csrf.status !== 200 || !csrf.body?.csrfToken) {
  console.error(`Could not start a session check (HTTP ${csrf.status}). The cookie is missing, expired or not for dev.`);
  process.exit(1);
}
const writeHeaders = { "x-csrf-token": csrf.body.csrfToken };

if (pr) {
  const m = /^([^/\s]+)\/([^#\s]+)#(\d+)$/.exec(pr);
  if (!m) {
    console.error("--pr must look like owner/repo#123");
    process.exit(2);
  }
  const r = await call(`/v1/prs/${m[1]}/${m[2]}/${m[3]}/risk`, { method: "POST", headers: writeHeaders });
  const q = r.body?.quality;
  report("Clef risk", r.status === 200 && Boolean(q), `HTTP ${r.status}, level=${r.body?.level}, quality=${q ? JSON.stringify(q) : "missing"}`);
  console.log("note: risk is cached per PR head commit; a PR already assessed at this commit will not call Clef again.");
}

if (image) {
  const bytes = await readFile(image);
  const form = new FormData();
  form.set("image", new Blob([bytes]), basename(image));
  const r = await call("/v1/highlight", { method: "POST", headers: writeHeaders, body: form });
  const regions = Array.isArray(r.body?.regions) ? r.body.regions : [];
  const fromSam = regions.some((x) => String(x.label ?? "").startsWith("Detected region"));
  report("Highlight", r.status === 200, `HTTP ${r.status}, ${regions.length} region(s), insight=${JSON.stringify(String(r.body?.insight ?? "").slice(0, 100))}`);
  report("SAM boxes", fromSam, fromSam ? "regions carry SAM's labels" : "no SAM regions: SAM found nothing, failed, or the route is off (Muse-only fallback)");
}

process.exit(failed ? 1 : 0);
