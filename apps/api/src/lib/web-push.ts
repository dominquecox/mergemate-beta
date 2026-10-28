import { base64url, fromBase64url } from './crypto';
import type { Deps, Env } from '../env';

/**
 * Web Push for browsers: RFC 8291 message encryption (aes128gcm) and RFC 8292 VAPID, on WebCrypto only.
 * The payload is encrypted for the one browser that subscribed; push services only see ciphertext.
 */
const encoder = new TextEncoder();

/** Largest plaintext we send. Services accept at most 4096 bytes for the whole body (86-byte header, 16-byte tag). */
export const MAX_PLAINTEXT = 1500;

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
};

const hkdf = async (salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number) => {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8));
};

/** Fixed inputs for tests only (the RFC 8291 example); production always uses fresh random values. */
export interface EncryptFixture { senderPrivateKey: CryptoKey; senderPublicKey: Uint8Array; salt: Uint8Array }

/** Builds the aes128gcm body: salt, record size, key id (sender public key) and one encrypted record. */
export async function encryptWebPush(
  plaintext: Uint8Array, browserPublicKey: Uint8Array, authSecret: Uint8Array, fixture?: EncryptFixture,
): Promise<Uint8Array> {
  if (browserPublicKey.length !== 65 || browserPublicKey[0] !== 4) throw new Error('Invalid subscription key');
  if (authSecret.length !== 16) throw new Error('Invalid subscription auth secret');
  if (plaintext.length > MAX_PLAINTEXT) throw new Error('Payload too large');
  const browser = await crypto.subtle.importKey('raw', browserPublicKey, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  let senderPrivate = fixture?.senderPrivateKey;
  let senderPublic = fixture?.senderPublicKey;
  if (!senderPrivate || !senderPublic) {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
    senderPrivate = pair.privateKey;
    senderPublic = new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer);
  }
  // The DOM property is `public`; the Workers typings name it `$public`.
  const ecdh = { name: 'ECDH', public: browser } as unknown as SubtleCryptoDeriveKeyAlgorithm;
  const shared = new Uint8Array(await crypto.subtle.deriveBits(ecdh, senderPrivate, 256));
  const keyInfo = concat(encoder.encode('WebPush: info\0'), browserPublicKey, senderPublic);
  const ikm = await hkdf(authSecret, shared, keyInfo, 32);
  const salt = fixture?.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, encoder.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // 0x02 marks the last (here only) record; no padding.
  const record = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(plaintext, new Uint8Array([2]))));
  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096, false);
  header[20] = senderPublic.length;
  return concat(header, senderPublic, record);
}

export interface Vapid { publicKey: string; signingKey: CryptoKey }

/** Reads the VAPID pair from the environment. Null (feature off) when either half is missing or malformed. */
export async function loadVapid(env: Env): Promise<Vapid | null> {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  try {
    const point = fromBase64url(publicKey);
    const d = fromBase64url(privateKey);
    if (point.length !== 65 || point[0] !== 4 || d.length !== 32) return null;
    const signingKey = await crypto.subtle.importKey(
      'jwk',
      { kty: 'EC', crv: 'P-256', x: base64url(point.slice(1, 33)), y: base64url(point.slice(33)), d: base64url(d), ext: true },
      { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'],
    );
    return { publicKey: base64url(point), signingKey };
  } catch {
    return null;
  }
}

const b64json = (value: unknown) => base64url(encoder.encode(JSON.stringify(value)));

/** `Authorization` value: a VAPID JWT (ES256) for the endpoint's origin, valid for 12 hours. */
export async function vapidAuthorization(vapid: Vapid, endpoint: string, subject: string, now: Date): Promise<string> {
  const input = `${b64json({ typ: 'JWT', alg: 'ES256' })}.${b64json({
    aud: new URL(endpoint).origin, exp: Math.floor(now.getTime() / 1000) + 12 * 3600, sub: subject,
  })}`;
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, vapid.signingKey, encoder.encode(input)));
  return `vapid t=${input}.${base64url(signature)}, k=${vapid.publicKey}`;
}

export interface WebSubscription { endpoint: string; p256dh: string; auth: string }
export type WebPushOutcome = 'ok' | 'gone' | 'failed';

/** Sends one encrypted message. 404/410 mean the browser dropped the subscription. No retries: a send may already be accepted. */
export async function sendWebPush(
  deps: Deps, vapid: Vapid, subject: string, subscription: WebSubscription, message: unknown,
): Promise<WebPushOutcome> {
  try {
    const body = await encryptWebPush(
      encoder.encode(JSON.stringify(message)), fromBase64url(subscription.p256dh), fromBase64url(subscription.auth),
    );
    const response = await deps.fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        authorization: await vapidAuthorization(vapid, subscription.endpoint, subject, deps.now()),
        'content-encoding': 'aes128gcm',
        'content-type': 'application/octet-stream',
        // Expire within the minute, so a message cannot be held into quiet hours.
        ttl: '60',
        urgency: 'normal',
      },
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 404 || response.status === 410) return 'gone';
    return response.status >= 200 && response.status < 300 ? 'ok' : 'failed';
  } catch {
    return 'failed';
  }
}
