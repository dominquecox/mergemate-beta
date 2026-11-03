export const REVIEW_STEPS = [
  { id: 'context', title: 'Understand the change', detail: 'Read the PR overview and executive verdict.', icon: 'git-pull-request-outline' },
  { id: 'evidence', title: 'Check the evidence', detail: 'Match checks and QA evidence to the current commit.', icon: 'shield-checkmark-outline' },
  { id: 'risk', title: 'Inspect sensitive changes', detail: 'Review risk findings, auth, billing and permissions.', icon: 'scan-outline' },
  { id: 'read', title: 'Read with a plan', detail: 'Open the diff and request a reading order if needed.', icon: 'reader-outline' },
  { id: 'verify', title: 'Verify the behavior', detail: 'Run the relevant tests and record what you observed.', icon: 'checkmark-done-outline' },
  { id: 'handoff', title: 'Make the next decision', detail: 'Add a private note or continue the review in GitHub.', icon: 'arrow-forward-outline' },
] as const;
export type ReviewStepId = typeof REVIEW_STEPS[number]['id'];
export interface ReviewPlaybook { title: string; steps: ReviewStepId[] }
export const PLAYBOOK_TEMPLATES: ReadonlyArray<ReviewPlaybook & { id: string; description: string; icon: string }> = [
  { id: 'everyday', title: 'Everyday review', description: 'A clear path from PR context to your next decision.', icon: 'git-compare-outline', steps: ['context', 'evidence', 'read', 'handoff'] },
  { id: 'sensitive', title: 'Sensitive change', description: 'Slow down for auth, billing and permission changes.', icon: 'shield-checkmark-outline', steps: ['context', 'evidence', 'risk', 'verify', 'handoff'] },
  { id: 'visual', title: 'UI & accessibility', description: 'Inspect the interface, screenshots and real-device behavior.', icon: 'phone-portrait-outline', steps: ['context', 'read', 'verify', 'handoff'] },
];
export function parsePlaybook(value: unknown): ReviewPlaybook | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.title !== 'string' || !v.title.trim() || v.title.length > 48 || !Array.isArray(v.steps) || v.steps.length < 2 || v.steps.length > 6) return null;
  if (new Set(v.steps).size !== v.steps.length || v.steps.some(id => !REVIEW_STEPS.some(step => step.id === id))) return null;
  return { title: v.title.trim(), steps: [...v.steps] as ReviewStepId[] };
}
export function parseReviewPr(input: string): { owner: string; repo: string; number: string } | null {
  if (input.length > 300) return null;
  try {
    const url = new URL(input.trim());
    if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password || url.search || url.hash) return null;
    const match = /^\/([a-z\d][a-z\d-]{0,38})\/([\w.-]{1,100})\/pull\/([1-9]\d{0,8})\/?$/i.exec(url.pathname);
    if (!match || match[2] === '.' || match[2] === '..') return null;
    return { owner: match[1]!, repo: match[2]!, number: match[3]! };
  } catch { return null; }
}
