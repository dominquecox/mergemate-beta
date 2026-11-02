import { z } from 'zod';

export const QaSha = z.string().regex(/^[a-f0-9]{40}$/);
const time = z.iso.datetime();
const safeName = z.string().min(1).max(120).regex(/^[a-zA-Z0-9][a-zA-Z0-9_. /-]*$/);
export const QaArtifact = z.object({
  name: z.string().min(1).max(180).regex(/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_.-]+)+$/).refine(v => !v.split('/').some(p => p === '.' || p === '..')),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().min(1).max(20 * 1024 * 1024),
}).strict();
export const QaSuite = z.object({
  id: z.enum(['export-web', 'mobile-polish', 'session-lifecycle']),
  status: z.enum(['passed', 'failed', 'timed_out', 'cancelled', 'output_limit', 'not_run']),
  exitCode: z.number().int().min(0).max(255).nullable(),
  durationMs: z.number().int().min(0).max(15 * 60 * 1000),
}).strict();
/** User-supplied runner receipt, not a signature or independent attestation. No prompts, credentials or raw logs. */
export const QaReport = z.object({
  version: z.literal(1),
  runId: z.uuid(),
  repository: z.string().regex(/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/).refine(v => !v.split('/').some(p => p === '.' || p === '..')),
  pullRequest: z.number().int().min(1).max(2147483647),
  headSha: QaSha,
  scope: z.literal('browser-fixtures'),
  runner: safeName,
  startedAt: time,
  completedAt: time,
  status: z.enum(['passed', 'failed', 'invalidated']),
  cleanCheckout: z.literal(true),
  suites: z.array(QaSuite).length(3),
  artifacts: z.array(QaArtifact).max(80),
}).strict().superRefine((r, ctx) => {
  if (Date.parse(r.completedAt) < Date.parse(r.startedAt) || Date.parse(r.completedAt) - Date.parse(r.startedAt) > 45 * 60 * 1000)
    ctx.addIssue({ code: 'custom', message: 'Invalid execution interval' });
  if (new Set(r.suites.map(s => s.id)).size !== 3) ctx.addIssue({ code: 'custom', message: 'Duplicate suites' });
  if (new Set(r.artifacts.map(a => a.name)).size !== r.artifacts.length) ctx.addIssue({ code: 'custom', message: 'Duplicate artifacts' });
  for (const s of r.suites) {
    if ((s.status === 'passed' && s.exitCode !== 0) || (s.status === 'failed' && s.exitCode === 0) || (['not_run', 'timed_out', 'cancelled', 'output_limit'].includes(s.status) && s.exitCode !== null))
      ctx.addIssue({ code: 'custom', message: 'Suite result contradicts exit code' });
  }
  if (r.status === 'passed' && (!r.suites.every(s => s.status === 'passed') || !r.artifacts.some(a => a.name.endsWith('.png'))))
    ctx.addIssue({ code: 'custom', message: 'Passing report needs all suites and screenshot artifacts' });
  if (r.status === 'failed' && r.suites.every(s => s.status === 'passed')) ctx.addIssue({ code: 'custom', message: 'Failed report contradicts suites' });
});
export type QaReport = z.infer<typeof QaReport>;
