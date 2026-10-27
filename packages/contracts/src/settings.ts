import { z } from 'zod';

const TimeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const IanaTimeZone = z.string().min(1).max(100).refine((value) => {
  if (!/^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)*$/.test(value)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}, 'Use an IANA time zone.');

export const QuietHours = z.object({
  start: TimeOfDay,
  end: TimeOfDay,
  timeZone: IanaTimeZone,
}).strict().refine((value) => value.start !== value.end, 'Quiet hours must have different start and end times.');
export type QuietHours = z.infer<typeof QuietHours>;

export const Settings = z.object({
  notifications: z.object({ review: z.boolean(), mention: z.boolean(), mine: z.boolean() }).strict(),
  quietHours: QuietHours.nullable(),
  aiSummaries: z.boolean(),
}).strict();
export type Settings = z.infer<typeof Settings>;
