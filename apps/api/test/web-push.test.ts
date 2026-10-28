import { describe, expect, it } from 'vitest';
import { base64url, fromBase64url } from '../src/lib/crypto';
import { encryptWebPush, loadVapid, vapidAuthorization } from '../src/lib/web-push';

// RFC 8291 section 5 / appendix A example: fixed keys, salt and plaintext, with the expected encrypted body.
const RFC = {
  plaintext: 'V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24',
  senderPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  senderPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  browserPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  browserPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  sharedSecret: 'kyrL1jIIOHEzg3sM2ZWRHDRB62YACZhhSlknJ672kSs',
  body: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

const ecJwk = (priv: string, pub: string) => {
  const point = fromBase64url(pub);
  return { kty: 'EC', crv: 'P-256', x: base64url(point.slice(1, 33)), y: base64url(point.slice(33)), d: priv, ext: true };
};

describe('RFC 8291 message encryption', () => {
  it('reproduces the RFC example byte for byte', async () => {
    const senderPrivateKey = await crypto.subtle.importKey('jwk', ecJwk(RFC.senderPrivate, RFC.senderPublic), { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
    const body = await encryptWebPush(fromBase64url(RFC.plaintext), fromBase64url(RFC.browserPublic), fromBase64url(RFC.auth), {
      senderPrivateKey, senderPublicKey: fromBase64url(RFC.senderPublic), salt: fromBase64url(RFC.salt),
    });
    expect(base64url(body)).toBe(RFC.body);
  });

  it('the example key material agrees (shared secret)', async () => {
    const sender = await crypto.subtle.importKey('jwk', ecJwk(RFC.senderPrivate, RFC.senderPublic), { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
    const browser = await crypto.subtle.importKey('raw', fromBase64url(RFC.browserPublic), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    const algorithm = { name: 'ECDH', public: browser } as unknown as SubtleCryptoDeriveKeyAlgorithm;
    expect(base64url(new Uint8Array(await crypto.subtle.deriveBits(algorithm, sender, 256)))).toBe(RFC.sharedSecret);
  });

  it('rejects malformed subscription keys and oversized payloads', async () => {
    const good = fromBase64url(RFC.browserPublic);
    const auth = fromBase64url(RFC.auth);
    await expect(encryptWebPush(new Uint8Array(3), good.slice(0, 64), auth)).rejects.toThrow();
    await expect(encryptWebPush(new Uint8Array(3), good, auth.slice(0, 15))).rejects.toThrow();
    await expect(encryptWebPush(new Uint8Array(2000), good, auth)).rejects.toThrow();
  });
});

describe('VAPID', () => {
  const keys = async () => {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
    const jwk = (await crypto.subtle.exportKey('jwk', pair.privateKey)) as JsonWebKey;
    const publicKey = base64url(new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer));
    return { publicKey, privateKey: String(jwk.d), verifyKey: pair.publicKey };
  };

  it('signs an ES256 JWT for the push service origin that the public key verifies', async () => {
    const { publicKey, privateKey, verifyKey } = await keys();
    const vapid = await loadVapid({ VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey });
    expect(vapid).not.toBeNull();
    if (!vapid) return;
    const now = new Date('2026-10-27T12:00:00Z');
    const header = await vapidAuthorization(vapid, 'https://fcm.googleapis.com/fcm/send/abc', 'https://mergemate.dev', now);
    const match = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header);
    expect(match).not.toBeNull();
    const [, head, claims, signature, k] = match ?? [];
    expect(k).toBe(publicKey);
    expect(JSON.parse(new TextDecoder().decode(fromBase64url(String(head))))).toEqual({ typ: 'JWT', alg: 'ES256' });
    const body = JSON.parse(new TextDecoder().decode(fromBase64url(String(claims)))) as { aud: string; exp: number; sub: string };
    expect(body).toEqual({ aud: 'https://fcm.googleapis.com', exp: Math.floor(now.getTime() / 1000) + 12 * 3600, sub: 'https://mergemate.dev' });
    expect(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, verifyKey, fromBase64url(String(signature)),
      new TextEncoder().encode(`${head}.${claims}`))).toBe(true);
  });

  it('is off unless both keys are well formed', async () => {
    const { publicKey, privateKey } = await keys();
    expect(await loadVapid({})).toBeNull();
    expect(await loadVapid({ VAPID_PUBLIC_KEY: publicKey })).toBeNull();
    expect(await loadVapid({ VAPID_PUBLIC_KEY: 'OWNER-PASTE-VAPID-PUBLIC-KEY', VAPID_PRIVATE_KEY: privateKey })).toBeNull();
    expect(await loadVapid({ VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: 'short' })).toBeNull();
  });
});
