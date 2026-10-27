import { expect, it } from 'vitest';
import { Settings, PushTokenRegistration } from '../src/index';

it('validates IANA zones, notification toggles and quiet-hour times', () => {
  const value = { notifications: { review: true, mention: false, mine: true }, aiSummaries: true, quietHours: { start: '22:00', end: '07:00', timeZone: 'America/Indiana/Indianapolis' } };
  expect(Settings.safeParse(value).success).toBe(true);
  expect(Settings.safeParse({ ...value, quietHours: { ...value.quietHours, timeZone: '+01:00' } }).success).toBe(false);
  expect(Settings.safeParse({ ...value, quietHours: { ...value.quietHours, start: '24:00' } }).success).toBe(false);
});
it('accepts Expo token formats and rejects arbitrary tokens or extra identity fields', () => {
  for (const prefix of ['ExpoPushToken', 'ExponentPushToken']) expect(PushTokenRegistration.safeParse({ deviceId: 'device_123', token: `${prefix}[fixture_token]` }).success).toBe(true);
  expect(PushTokenRegistration.safeParse({ deviceId: 'device_123', token: 'not-a-token' }).success).toBe(false);
  expect(PushTokenRegistration.safeParse({ deviceId: 'device_123', token: 'ExpoPushToken[fixture_token]', userId: 'other-user' }).success).toBe(false);
});
