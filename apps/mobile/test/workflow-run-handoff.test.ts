import {describe,expect,it} from 'vitest';
import {workflowApprovalUrl,workflowRunParam} from '../src/workflows/run-handoff';

describe('workflow approval handoff',()=>{
  it('carries the validated run into the authenticated web workspace',()=>{
    expect(workflowRunParam('run_abc-123')).toBe('run_abc-123');
    expect(workflowApprovalUrl('https://dev.mergemate.dev','run_abc-123')).toBe('https://dev.mergemate.dev/workflows?run=run_abc-123');
  });

  it('rejects path, query and oversized run identifiers',()=>{
    for(const value of ['../other','run_1&target=other','a'.repeat(101),['run_1'],undefined])expect(workflowRunParam(value)).toBe('');
  });
});
