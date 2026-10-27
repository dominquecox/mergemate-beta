import { Settings, type QuietHours } from '@mergemate/contracts';
import { requireBinding } from '../config';
import type { Env } from '../env';
import { ApiError } from '../errors';

export const defaultSettings = (): Settings => ({
  notifications: { review: true, mention: true, mine: true },
  quietHours: null,
  aiSummaries: true,
});

export const demoSettings = (): Settings => ({
  notifications: { review: true, mention: true, mine: false },
  quietHours: { start: '22:00', end: '07:00', timeZone: 'America/New_York' },
  aiSummaries: true,
});

export async function getSettings(env: Env, userId: string): Promise<Settings> {
  const row = await requireBinding(env, 'DB').prepare('SELECT settings FROM user_settings WHERE user_id=?')
    .bind(userId).first<{ settings: string }>();
  if (!row) return defaultSettings();
  try {
    return Settings.parse(JSON.parse(row.settings));
  } catch {
    throw new ApiError('internal', 'Settings could not be read. Try again.');
  }
}

export function inQuietHours(quiet: QuietHours | null, now: Date): boolean {
  if (!quiet) return false;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: quiet.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const minute = Number(parts.find((part) => part.type === 'hour')?.value) * 60
    + Number(parts.find((part) => part.type === 'minute')?.value);
  const toMinutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  const start = toMinutes(quiet.start);
  const end = toMinutes(quiet.end);
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}
