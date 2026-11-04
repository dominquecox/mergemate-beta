import type { WorkflowRun } from '@mergemate/contracts';
import { displayRunStatus } from './agent-model';

export function matchRuns(runs: WorkflowRun[], query: string): WorkflowRun[] {
  const q = query.trim().toLowerCase();
  if (!q) return runs;
  return runs.filter((run) => run.definition.name.toLowerCase().includes(q) || displayRunStatus(run.status).toLowerCase().includes(q));
}

export function formatRunTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}
