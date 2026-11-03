import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { codeNames, compare, fileNames } from '../scripts/check-env.mjs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

// Owner-approved variable names (owner, 2026-10-27). Renaming, adding or dropping one is a deliberate change:
// update this list in the same PR and get the owner's approval, because deployed secrets are set by these exact names.
const APPROVED = [
  'AI_DAILY_ACTIONS_FREE', 'AI_DAILY_ACTIONS_PRO', 'AI_DAILY_TRIAGE_FREE', 'AI_DAILY_TRIAGE_PRO', 'AI_GATEWAY_ID',
  'AI_GLOBAL_DAILY_ACTIONS', 'AI_PROFILE', 'APP_ENV', 'EMAIL_FROM', 'EXPO_ACCESS_TOKEN', 'GITHUB_APP_CLIENT_ID', 'GITHUB_APP_CLIENT_SECRET',
  'GITHUB_APP_SLUG', 'GITHUB_WEBHOOK_SECRET', 'GITHUB_WEBHOOK_SECRET_NEXT', 'MODEL_API_KEY', 'MODEL_BASE_URL',
  'MODEL_ROUTE_DECISION', 'MODEL_ROUTE_HIGHLIGHT', 'MODEL_ROUTE_RISK', 'MODEL_ROUTE_SEGMENT', 'MODEL_ROUTE_SUMMARY', 'MODEL_ROUTE_TRIAGE', 'RESEND_API_KEY', 'SITE_ORIGIN',
  'STRIPE_MODE', 'STRIPE_PRICE_PRO_ANNUAL', 'STRIPE_PRICE_PRO_MONTHLY', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET',
  'SUPPORT_EMAIL', 'TELEMETRY_SALT', 'TOKEN_ENCRYPTION_KEY', 'TOKEN_ENCRYPTION_KEY_PREVIOUS', 'TURNSTILE_SECRET_KEY', 'VAPID_PRIVATE_KEY',
  'VAPID_PUBLIC_KEY', 'WEB_ORIGIN', 'WORKFLOW_RUNNER_REPOS', 'WORKFLOW_RUNNER_TOKEN',
];

describe('environment variable names', () => {
  const code = codeNames(read('../src/env.ts'));
  const example = fileNames(read('../.dev.vars.example'));

  it('match the owner-approved list exactly', () => {
    expect([...code].sort()).toEqual([...APPROVED].sort());
  });

  it('.dev.vars.example names only variables the code reads', () => {
    expect(compare({ code, example, local: null }).problems).toEqual([]);
  });

  it('flags a wrong local name and reports missing ones by name only', () => {
    const local = fileNames('GITHUB_CLIENT_SECRET=secret-value-1\nMODEL_API_KEY="secret-value-2"\n');
    const { problems, warnings } = compare({ code, example, local });
    expect(problems).toEqual(['.dev.vars has GITHUB_CLIENT_SECRET, which the code never reads (wrong name?)']);
    expect(warnings).toContain('.dev.vars is missing GITHUB_APP_CLIENT_SECRET');
    expect(warnings).not.toContain('.dev.vars is missing GITHUB_WEBHOOK_SECRET_NEXT');
    expect(JSON.stringify({ problems, warnings })).not.toContain('secret-value');
  });
});
