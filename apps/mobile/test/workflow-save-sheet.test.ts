import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { WorkflowDefinition } from '@mergemate/contracts';
import { makeAgentTemplate, saveDraftFor, applySaveDraft, SAVE_DESCRIPTION_MAX } from '../src/workflows/agent-model';

const target = { owner: 'owner', repo: 'repo', number: 7 };
const base = () => makeAgentTemplate('review', target);

describe('save workflow sheet', () => {
  it('prefills the template name, and a copy gets its own name', () => {
    const d = base();
    expect(saveDraftFor(d)).toEqual({ name: d.name, description: '' });
    expect(saveDraftFor({ ...d, description: 'nightly check' }, true)).toEqual({ name: `${d.name.slice(0, 75)} copy`, description: 'nightly check' });
  });

  it('saves a trimmed name and optional description that the shared contract accepts', () => {
    const applied = applySaveDraft(base(), { name: '  My review  ', description: '  Checks risky PRs  ' });
    expect('definition' in applied && applied.definition).toMatchObject({ name: 'My review', description: 'Checks risky PRs' });
    if ('definition' in applied) expect(WorkflowDefinition.safeParse(applied.definition).success).toBe(true);
    const cleared = applySaveDraft({ ...base(), description: 'old' }, { name: 'Kept', description: '   ' });
    expect('definition' in cleared && 'description' in cleared.definition).toBe(false);
  });

  it('explains an empty name or an overlong field instead of saving', () => {
    expect(applySaveDraft(base(), { name: '  ', description: '' })).toEqual({ error: 'Give the workflow a name.' });
    expect(applySaveDraft(base(), { name: 'x'.repeat(81), description: '' })).toEqual({ error: 'Use 80 characters or fewer for the name.' });
    expect('error' in applySaveDraft(base(), { name: 'ok', description: 'x'.repeat(SAVE_DESCRIPTION_MAX + 1) })).toBe(true);
    expect(WorkflowDefinition.safeParse({ ...base(), description: 'x'.repeat(SAVE_DESCRIPTION_MAX + 1) }).success).toBe(false);
  });

  it('Save opens the sheet, the composer precedes templates, and phones stack Save and Run', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../app/workflows.tsx'), 'utf8');
    expect(source).toContain("onPress={() => openSaveSheet()}");
    expect(source).not.toMatch(/onPress=\{\(\) => saveWorkflow\(/);
    expect(source).toContain("flexDirection: isDesktop ? 'row-reverse' : 'column-reverse'");
    expect(source).toContain(": { flexDirection: 'column', gap: 10, alignItems: 'stretch' }");
  });
});
