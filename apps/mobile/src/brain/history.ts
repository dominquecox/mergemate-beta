import type { TrackEvent } from '@mergemate/contracts';

/** Consecutive identical events (same kind, actor and text) show as one row with a count. */
export function collapseEvents(events: readonly TrackEvent[]): { event: TrackEvent; count: number }[] {
  const rows: { event: TrackEvent; count: number }[] = [];
  for (const event of events) {
    const last = rows[rows.length - 1];
    if (last && last.event.kind === event.kind && last.event.actor === event.actor && (last.event.text ?? '') === (event.text ?? '')) last.count++;
    else rows.push({ event, count: 1 });
  }
  return rows;
}

/** "just now", "2m ago", "3h ago", "4d ago". */
export function timeAgo(at: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(at)) / 1000));
  if (!Number.isFinite(seconds) || seconds < 45) return 'just now';
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}

const PHRASE: Record<TrackEvent['kind'], string> = {
  lock: 'Locked the card', unlock: 'Unlocked the card', heartbeat: 'Still working', handoff: 'Handed off',
  pr_opened: 'Draft PR opened', validation: 'Validation', verified: 'Verified', merged: 'Merged', deploy: 'Deployed', note: 'Note',
};
/** The event's own text, or a plain phrase for its kind. */
export const eventText = (event: TrackEvent): string => (event.text && event.text.trim()) || PHRASE[event.kind];

export type EventTone = 'good' | 'bad' | 'info' | 'muted';
export const eventTone = (event: TrackEvent): EventTone =>
  event.kind === 'pr_opened' || event.kind === 'merged' || event.kind === 'deploy' ? 'good'
    : event.kind === 'verified' && /^FAIL/.test(event.text ?? '') ? 'bad'
      : event.kind === 'verified' || event.kind === 'validation' ? 'good'
        : event.kind === 'lock' || event.kind === 'handoff' ? 'info' : 'muted';
