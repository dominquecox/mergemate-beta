import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(__dirname, '..', 'app', 'workflows.tsx'), 'utf8');

describe('opening a run on the Workflows page', () => {
  it('wraps the run receipt in a referenced view', () => {
    expect(source).toMatch(/<View ref=\{runPanelRef\}[^>]*>\s*<Button title="Back to workflow builder"/);
  });

  it('scrolls the receipt into view whenever the selected run changes', () => {
    expect(source).toMatch(/useEffect\(\(\) => \{\s*if \(!selectedRunId\) return;[\s\S]*scrollIntoView\(\{ behavior: 'smooth', block: 'start' \}\)[\s\S]*\}, \[selectedRunId\]\);/);
  });
});
