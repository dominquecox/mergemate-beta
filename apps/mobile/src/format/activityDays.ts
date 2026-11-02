/** Calendar arithmetic uses UTC day ordinals after extracting the user's local date (DST safe). */
function ordinal(date: Date, timeZone?: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year:'numeric',month:'2-digit',day:'2-digit' }).formatToParts(date);
  const value = (key: string) => Number(parts.find(p => p.type === key)?.value);
  return Date.UTC(value('year'),value('month')-1,value('day')) / 86400000;
}
export function activityDay(iso: string, now = new Date(), timeZone?: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return 'Time unavailable';
  const age = ordinal(now,timeZone) - ordinal(date,timeZone);
  if (age === 0) return 'Today';
  if (age === 1) return 'Yesterday';
  if (age >= 2 && age <= 7) return 'Last Week';
  return new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'short',day:'numeric'}).format(date);
}
