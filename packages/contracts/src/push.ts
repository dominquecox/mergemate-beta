import { z } from 'zod';

export const DeviceId = z.string().regex(/^[A-Za-z0-9_-]{8,128}$/);
export const ExpoPushToken = z.string().max(200).regex(/^(?:ExpoPushToken|ExponentPushToken)\[[A-Za-z0-9_-]+\]$/);
export const PushTokenRegistration = z.object({ deviceId: DeviceId, token: ExpoPushToken }).strict();
export type PushTokenRegistration = z.infer<typeof PushTokenRegistration>;
export const PushTokenRemoval = z.object({ deviceId: DeviceId }).strict();
export type PushTokenRemoval = z.infer<typeof PushTokenRemoval>;
export const PushTokenRegistered = z.object({ registered: z.literal(true) });

// Web Push (browsers). The server posts to the subscription endpoint, so only the push services of the
// browsers we support are accepted: a client can never point the Worker at another host.
const WEB_PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^web\.push\.apple\.com$/,
  /^[a-z0-9-]+\.push\.apple\.com$/,
  /^[a-z0-9-]+\.notify\.windows\.com$/,
];
export const isWebPushEndpoint = (value: string): boolean => {
  // https only; the host group cannot hold a port or credentials; no fragment.
  const match = /^https:\/\/([A-Za-z0-9.-]+)(?:[/?][^\s#]*)?$/.exec(value);
  const host = match?.[1]?.toLowerCase();
  return host !== undefined && WEB_PUSH_HOSTS.some((allowed) => allowed.test(host));
};
export const WebPushEndpoint = z.string().max(1000).refine(isWebPushEndpoint, 'Not a supported push service.');
export const WebPushSubscription = z.object({
  deviceId: DeviceId,
  endpoint: WebPushEndpoint,
  // Unpadded base64url: the 65-byte P-256 public key and the 16-byte auth secret.
  keys: z.object({ p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}$/), auth: z.string().regex(/^[A-Za-z0-9_-]{22}$/) }).strict(),
}).strict();
export type WebPushSubscription = z.infer<typeof WebPushSubscription>;
export const WebPushKey = z.object({ publicKey: z.string().regex(/^[A-Za-z0-9_-]{87}$/) });
export type WebPushKey = z.infer<typeof WebPushKey>;
