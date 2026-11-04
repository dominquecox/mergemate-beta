import { describe, expect, it } from 'vitest';
import { ProjectSchema } from '@mergemate/contracts';
import { findBoard, splitRepoName } from '../src/brain/boardForm';
import { MockApiClient } from '../src/api/mock';

describe('create board helpers', () => {
  it('splits plain owner/repo names and rejects anything else', () => {
    expect(splitRepoName('acme/web.app')).toEqual({ owner: 'acme', repo: 'web.app' });
    for (const bad of ['', 'acme', 'a/b/c', '/b', 'a/', 'a b/c', 'a/b c', `a/${'x'.repeat(101)}`]) expect(splitRepoName(bad)).toBeNull();
  });
  it('finds an existing board ignoring case', () => {
    const p = ProjectSchema.parse({ id: 'p1', owner: 'Acme', repo: 'Web', rules: 'r', createdAt: new Date().toISOString() });
    expect(findBoard([p], 'acme', 'web')).toBe(p);
    expect(findBoard([p], 'acme', 'other')).toBeUndefined();
  });
});

describe('mock createBrainProject', () => {
  it('creates a contract-valid project that then shows in the list, and 409s on a repeat', async () => {
    const api = new MockApiClient();
    const { project } = await api.createBrainProject({ owner: 'acme', repo: 'newrepo' });
    expect(ProjectSchema.safeParse(project).success).toBe(true);
    expect((await api.getBrainProjects()).projects.map((p) => p.repo)).toContain('newrepo');
    await expect(api.createBrainProject({ owner: 'ACME', repo: 'newrepo' })).rejects.toMatchObject({ code: 'state_conflict' });
  });
});
