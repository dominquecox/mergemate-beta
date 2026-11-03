import { z } from 'zod';
import { WorkflowCapabilities, WorkflowDefinition, WorkflowRun, WorkflowPlanRequest, WorkflowRunRequest, type WorkflowTarget } from '@mergemate/contracts';
import { HttpTransport } from '../api/http-transport';
import type { HttpApiClientOptions } from '../api/http-types';

/** Uses the same cookie/CSRF/native bearer, cancellation and session fences as the main API client. */
export class WorkflowApiClient extends HttpTransport {
  constructor(options: HttpApiClientOptions) { super(options); }
  capabilities(target: WorkflowTarget, signal: AbortSignal) {
    return this.request({ path: `/workflows/capabilities?repo=${encodeURIComponent(`${target.owner}/${target.repo}`)}`, schema: WorkflowCapabilities, signal });
  }
  plan(input: z.infer<typeof WorkflowPlanRequest>, signal: AbortSignal) {
    return this.request({ method:'POST', path:'/workflows/plan', body: WorkflowPlanRequest.parse(input), schema: WorkflowDefinition, signal, timeoutMs: 90_000 });
  }
  start(input: z.infer<typeof WorkflowRunRequest>, signal: AbortSignal) {
    return this.request({ method:'POST', path:'/workflows/runs', body: WorkflowRunRequest.parse(input), schema: WorkflowRun, signal });
  }
  runs(signal: AbortSignal) {
    return this.request({ path:'/workflows/runs', schema:z.object({ runs:z.array(WorkflowRun).max(100) }), signal });
  }
  run(id: string, signal: AbortSignal) {
    return this.request({ path:`/workflows/runs/${encodeURIComponent(id)}`, schema:WorkflowRun, signal });
  }
  cancel(id: string, signal: AbortSignal) {
    return this.request({ method:'POST', path:`/workflows/runs/${encodeURIComponent(id)}/cancel`, body:{}, schema:WorkflowRun, signal });
  }
}
