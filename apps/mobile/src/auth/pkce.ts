/**
 * PKCE for the GitHub sign-in. The app makes a one-time verifier, sends only its SHA-256 challenge to
 * the API when starting, and sends the verifier when exchanging the code. The API stores the challenge
 * and the state; the app only follows the redirect and posts the code it gets back.
 */
export interface PkcePrimitives {
  randomBytes(count: number): Uint8Array;
  /** Base64url (no padding) of the SHA-256 of the ASCII string. */
  sha256Base64Url(value: string): Promise<string>;
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** Base64url without padding. */
export function base64UrlEncode(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] ?? 0;
    const b1 = bytes[i + 1] ?? 0;
    const b2 = bytes[i + 2] ?? 0;
    out += ALPHABET[b0 >> 2];
    out += ALPHABET[((b0 & 3) << 4) | (b1 >> 4)];
    if (i + 1 < bytes.length) out += ALPHABET[((b1 & 15) << 2) | (b2 >> 6)];
    if (i + 2 < bytes.length) out += ALPHABET[b2 & 63];
  }
  return out;
}

const expoPrimitives: PkcePrimitives = {
  randomBytes(count) {
    // Loaded on use so the module can be imported where the native crypto module is not available.
    const Crypto = require("expo-crypto") as typeof import("expo-crypto");
    return Crypto.getRandomBytes(count);
  },
  async sha256Base64Url(value) {
    const Crypto = require("expo-crypto") as typeof import("expo-crypto");
    const base64 = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value, {
      encoding: Crypto.CryptoEncoding.BASE64,
    });
    return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  },
};

/** A verifier of 43 URL-safe characters (256 bits) and its S256 challenge, also 43 characters. */
export async function createPkcePair(primitives: PkcePrimitives = expoPrimitives) {
  const verifier = base64UrlEncode(primitives.randomBytes(32));
  const challenge = await primitives.sha256Base64Url(verifier);
  return { verifier, challenge };
}

/** A random identifier for this installation, used to register and remove its push token. */
export function createDeviceId(primitives: Pick<PkcePrimitives, "randomBytes"> = expoPrimitives): string {
  return base64UrlEncode(primitives.randomBytes(16));
}
