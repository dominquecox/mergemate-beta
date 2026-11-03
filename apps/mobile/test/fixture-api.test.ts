import { describe, it, expect } from 'vitest';
import { fixtureApiUrl } from '../scripts/fixture-api.mjs';

describe('same-origin API browser fixtures', () => {
  it('maps only the local proxy API path for existing fixture handlers', () => {
    expect(fixtureApiUrl('http://localhost:8085/__api/v1/me?probe=1','http://localhost:8085').href).toBe('https://api-dev.mergemate.dev/v1/me?probe=1');
  });
  it('keeps assets, unrelated origins and near-matching paths unchanged', () => {
    for(const input of ['http://localhost:8085/sign-in','http://localhost:8085/__api/v10/me','https://other.invalid/__api/v1/me','https://api-dev.mergemate.dev/v1/me'])expect(fixtureApiUrl(input,'http://localhost:8085').href).toBe(input);
  });
});
