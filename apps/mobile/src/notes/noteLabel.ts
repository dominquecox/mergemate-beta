import type { NoteListContext } from '@mergemate/contracts';

/** Plain-words label for where a note was written. Unknown kinds read as "Note". */
export function noteContextLabel(context: NoteListContext): string {
  if (context.kind === 'pr') return `${context.repo}#${context.number}`;
  if (context.kind === 'highlight') return 'Camera';
  if (context.kind === 'card') return 'Card';
  return 'Note';
}

/** Where tapping a note goes; null when the context has no page to open. */
export function noteContextHref(context: NoteListContext): string | null {
  if (context.kind === 'pr') {
    const [owner, repo] = context.repo.split('/');
    return owner && repo ? `/pr/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${context.number}` : null;
  }
  if (context.kind === 'highlight') return '/highlight';
  if (context.kind === 'card') return '/(tabs)/brain';
  return null;
}
