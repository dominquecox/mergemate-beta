import { describe, expect, it } from 'vitest';
import { ApiClientError } from '../src/api/errors';
import { errorDetailsOf, errorReportText, safePageUrl } from '../src/api/error-details';

describe('copy error details', () => {
  it('keeps the code, status and request id of an API failure, and nothing for other errors', () => {
    const details = errorDetailsOf(new ApiClientError('upstream_unavailable', 'GitHub App installation token is unavailable.', { status: 502, requestId: 'req_123' }));
    expect(details).toMatchObject({ code: 'upstream_unavailable', status: 502, requestId: 'req_123' });
    expect(errorDetailsOf(new Error('boom'))).toBeNull();
  });

  it('builds a short block with the fields support needs', () => {
    const text = errorReportText({ code: 'upstream_unavailable', status: 502, message: 'Draft publication failed.', requestId: 'req_123', runId: 'f58315bf-353b-4688-94ff-cd2ec6c42de3', step: 'Create a draft pull request', at: new Date('2026-11-04T21:30:00Z'), pageUrl: 'https://dev.mergemate.dev/workflows?run=f58315bf' });
    expect(text).toBe([
      'MergeMate error details',
      'Error: upstream_unavailable',
      'HTTP status: 502',
      'Message: Draft publication failed.',
      'Request id: req_123',
      'Run id: f58315bf-353b-4688-94ff-cd2ec6c42de3',
      'Step: Create a draft pull request',
      'Time: 2026-11-04T21:30:00.000Z',
      'Page: https://dev.mergemate.dev/workflows',
    ].join('\n'));
  });

  it('never copies credentials, query strings or odd ids', () => {
    const text = errorReportText({ message: 'failed with ghs_abcdefghijklmnop1234 and Bearer abc.def.ghi1234 eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.c2lnbmF0dXJlMTIz', requestId: 'req 1\nInjected: x', at: new Date('2026-11-04T00:00:00Z'), pageUrl: 'https://dev.mergemate.dev/auth/callback?code=secret#token=x' });
    expect(text).not.toMatch(/ghs_|abc\.def|eyJ|secret|token=|Injected/);
    expect(text).toContain('Page: https://dev.mergemate.dev/auth/callback');
    expect(text.split('\n')).toHaveLength(4);
    expect(safePageUrl('javascript:alert(1)')).toBeUndefined();
  });
});
