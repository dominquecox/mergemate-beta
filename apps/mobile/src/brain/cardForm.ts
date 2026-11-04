import { CreateCardRequestSchema, type Card, type CreateCardRequest, type UpdateCardRequest } from '@mergemate/contracts';

export type Priority = 'P0' | 'P1' | 'P2';
export const PRIORITIES: readonly Priority[] = ['P0', 'P1', 'P2'];
export const RULES_MAX = 20480;

export interface CardDraft {
  title: string;
  details: string;
  priority: Priority;
  doneWhen: string;
}

export type DraftResult<T> = { ok: true; value: T } | { ok: false; error: string };

export const emptyDraft = (): CardDraft => ({ title: '', details: '', priority: 'P1', doneWhen: '' });
export const draftFromCard = (card: Card): CardDraft => ({ title: card.title, details: card.details, priority: card.priority, doneWhen: card.doneWhen });

const FIELD_LABELS: Record<string, string> = { title: 'Title', details: 'Details', doneWhen: 'Done when', priority: 'Priority' };

function firstProblem(draft: CardDraft, projectId: string): string | null {
  const parsed = CreateCardRequestSchema.safeParse({ projectId, ...trimmed(draft) });
  if (parsed.success) return null;
  const issue = parsed.error.issues[0];
  const field = FIELD_LABELS[String(issue?.path[0])] ?? 'This field';
  return issue?.code === 'too_big' ? `${field} is too long.` : `${field} is required.`;
}

const trimmed = (draft: CardDraft): CardDraft => ({ ...draft, title: draft.title.trim(), details: draft.details.trim(), doneWhen: draft.doneWhen.trim() });

export function toCreateRequest(projectId: string, draft: CardDraft): DraftResult<CreateCardRequest> {
  const problem = firstProblem(draft, projectId);
  if (problem) return { ok: false, error: problem };
  return { ok: true, value: CreateCardRequestSchema.parse({ projectId, ...trimmed(draft) }) };
}

/** Sends only the fields that changed; refuses an edit that changes nothing. */
export function toUpdateRequest(projectId: string, card: Card, draft: CardDraft): DraftResult<UpdateCardRequest> {
  const problem = firstProblem(draft, projectId);
  if (problem) return { ok: false, error: problem };
  const next = trimmed(draft);
  const patch: UpdateCardRequest = { projectId, cardId: card.id };
  if (next.title !== card.title) patch.title = next.title;
  if (next.details !== card.details) patch.details = next.details;
  if (next.priority !== card.priority) patch.priority = next.priority;
  if (next.doneWhen !== card.doneWhen) patch.doneWhen = next.doneWhen;
  if (Object.keys(patch).length === 2) return { ok: false, error: 'Nothing changed.' };
  return { ok: true, value: patch };
}

export function validateRules(rules: string): DraftResult<string> {
  const value = rules.trim();
  if (!value) return { ok: false, error: 'Rules cannot be empty.' };
  if (value.length > RULES_MAX) return { ok: false, error: `Rules must be at most ${RULES_MAX} characters.` };
  return { ok: true, value };
}

/** The position a card lands in after moving one step; null at the ends. */
export function movedPosition(cards: readonly Card[], cardId: string, delta: -1 | 1): number | null {
  const index = cards.findIndex((card) => card.id === cardId);
  const next = index + delta;
  return index < 0 || next < 0 || next >= cards.length ? null : next;
}
