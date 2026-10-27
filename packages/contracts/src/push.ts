import { z } from 'zod';

export const DeviceId = z.string().regex(/^[A-Za-z0-9_-]{8,128}$/);
export const ExpoPushToken = z.string().max(200).regex(/^(?:ExpoPushToken|ExponentPushToken)\[[A-Za-z0-9_-]+\]$/);
export const PushTokenRegistration = z.object({ deviceId: DeviceId, token: ExpoPushToken }).strict();
export type PushTokenRegistration = z.infer<typeof PushTokenRegistration>;
export const PushTokenRemoval = z.object({ deviceId: DeviceId }).strict();
export type PushTokenRemoval = z.infer<typeof PushTokenRemoval>;
export const PushTokenRegistered = z.object({ registered: z.literal(true) });
