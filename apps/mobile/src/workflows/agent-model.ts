import { WorkflowDefinition, type WorkflowRun, type WorkflowStepKind, type WorkflowTarget } from '@mergemate/contracts';
import { parseReviewPr } from './model';

export type AgentMode = 'review' | 'code_fix';
export const AGENT_STEP_META: Record<WorkflowStepKind, { title: string; detail: string; icon: string }> = {
  context: { title: 'Gather PR context', detail: 'Pin the accessible pull request and current commit.', icon: 'git-pull-request-outline' },
  checks: { title: 'Inspect check evidence', detail: 'Read checks already reported for that commit.', icon: 'shield-checkmark-outline' },
  risk: { title: 'Assess change risk', detail: 'Analyze sensitive changes with the configured model.', icon: 'scan-outline' },
  summary: { title: 'Summarize the change', detail: 'Generate a grounded summary of the PR.', icon: 'sparkles-outline' },
  review_plan: { title: 'Build a review plan', detail: 'Produce a reading order and verification plan.', icon: 'reader-outline' },
  patch: { title: 'Prepare a code change', detail: 'Generate a bounded patch for the isolated executor.', icon: 'code-slash-outline' },
  qa: { title: 'Execute isolated tests', detail: 'Run the configured test policy and capture actual results.', icon: 'flask-outline' },
  draft_pr: { title: 'Create a draft PR', detail: 'Publish a tested change when write permissions permit it.', icon: 'git-branch-outline' },
  route: { title: 'Report the outcome', detail: 'Collect findings and evidence for the next decision.', icon: 'paper-plane-outline' },
};
export const AGENT_TEMPLATES: ReadonlyArray<{ id: string; name: string; description: string; mode: AgentMode; icon: string; intent: string; kinds: WorkflowStepKind[] }> = [
  { id: 'review', name: 'Review this PR', description: 'Context, checks, risk and a clear review plan.', mode: 'review', icon: 'git-compare-outline', intent: 'Review this pull request, assess risk, inspect reported checks and prepare a reading and verification plan.', kinds: ['context','checks','risk','summary','review_plan','route'] },
  { id: 'security', name: 'Inspect sensitive changes', description: 'Focus on auth, data access and permission boundaries.', mode: 'review', icon: 'shield-checkmark-outline', intent: 'Inspect this pull request for sensitive auth, data access, billing and permission changes. Report evidence and a verification plan.', kinds: ['context','checks','risk','review_plan','route'] },
  { id: 'visual', name: 'Review UI changes', description: 'A focused review plan for interfaces and accessibility.', mode: 'review', icon: 'phone-portrait-outline', intent: 'Review this pull request for UI and accessibility changes. Summarize the change and prepare a device and keyboard verification plan.', kinds: ['context','summary','review_plan','route'] },
  { id: 'fix', name: 'Prepare a tested fix', description: 'Diagnose, patch, test and open a draft PR.', mode: 'code_fix', icon: 'code-working-outline', intent: 'Diagnose the issue in this pull request, prepare a minimal fix, execute the configured isolated tests and create a draft pull request if tests pass.', kinds: ['context','checks','risk','patch','qa','draft_pr','route'] },
  { id: 'regression', name: 'Fix a regression', description: 'A bounded code change with real test evidence.', mode: 'code_fix', icon: 'construct-outline', intent: 'Investigate the reported regression in this pull request, implement a small source fix, validate it with the configured isolated test policy and create a draft pull request.', kinds: ['context','risk','patch','qa','draft_pr','route'] },
];
export function targetFromPrUrl(value: string): WorkflowTarget | null {
  const target = parseReviewPr(value);
  return target ? { ...target, number: Number(target.number) } : null;
}
export function makeAgentTemplate(id: string, target: WorkflowTarget): WorkflowDefinition {
  const template = AGENT_TEMPLATES.find(value => value.id === id) ?? AGENT_TEMPLATES[0]!;
  return WorkflowDefinition.parse({ name: template.name, intent: template.intent, mode: template.mode, target, steps: template.kinds.map(kind => ({ id: kind, kind, title: AGENT_STEP_META[kind].title, enabled: true })) });
}
export function isRunActive(status: WorkflowRun['status']): boolean {
  return status === 'queued' || status === 'running' || status === 'waiting_executor';
}
export function moveAgentStep(definition: WorkflowDefinition, index: number, direction: -1 | 1): WorkflowDefinition | null {
  const to = index + direction;
  if (to < 0 || to >= definition.steps.length) return null;
  const steps = [...definition.steps];
  [steps[index], steps[to]] = [steps[to]!, steps[index]!];
  const result = WorkflowDefinition.safeParse({ ...definition, steps });
  return result.success ? result.data : null;
}
export function toggleAgentStep(definition: WorkflowDefinition, id: string): WorkflowDefinition | null {
  const steps = definition.steps.map(step => step.id === id ? { ...step, enabled: !step.enabled } : step);
  const result = WorkflowDefinition.safeParse({ ...definition, steps });
  return result.success ? result.data : null;
}
export function safeDraftPrLink(value: unknown, target: WorkflowTarget): string | null {
  if (typeof value !== 'string' || value.length > 400) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.username || url.password || url.port || url.search || url.hash) return null;
    const prefix = `/${target.owner}/${target.repo}/pull/`;
    return url.pathname.startsWith(prefix) && /^[1-9]\d{0,8}\/?$/.test(url.pathname.slice(prefix.length)) ? url.href : null;
  } catch { return null; }
}
export function displayRunStatus(status: WorkflowRun['status'] | WorkflowRun['steps'][number]['status']): string {
  return ({ queued:'Queued',running:'Running',waiting_executor:'Waiting for executor',succeeded:'Succeeded',failed:'Failed',cancelled:'Cancelled',blocked:'Blocked',pending:'Not started',skipped:'Skipped' } as Record<string,string>)[status] ?? status;
}
export function evidenceText(value: unknown, limit = 4000): string {
  try { const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2); return (text ?? '').slice(0, limit); }
  catch { return 'Evidence could not be displayed.'; }
}
