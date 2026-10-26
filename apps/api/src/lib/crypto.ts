import { ConfigError } from "../errors";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const fromBase64 = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
};

/** 256-bit random value, base64url encoded. */
export const randomToken = () => base64url(crypto.getRandomValues(new Uint8Array(32)));

export const sha256 = async (value: string) =>
  new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));

export const sha256Hex = async (value: string) =>
  Array.from(await sha256(value), (b) => b.toString(16).padStart(2, "0")).join("");

/** PKCE S256: base64url(SHA-256(verifier)). */
export const pkceChallenge = async (verifier: string) => base64url(await sha256(verifier));

/** Constant-time comparison of two strings. */
export const timingSafeEqual = (a: string, b: string) => {
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
};

interface VersionedKey {
  version: string;
  key: CryptoKey;
}

/** Parses `<version>:<base64 32-byte key>`. The detail never includes the value. */
const parseKey = async (name: string, value: string | undefined): Promise<VersionedKey | undefined> => {
  if (!value?.trim()) return undefined;
  const match = /^([A-Za-z0-9]{1,16}):([A-Za-z0-9+/_-]+=*)$/.exec(value.trim());
  if (!match?.[1] || !match[2]) throw new ConfigError(`${name} must be <version>:<base64 key>`);
  let raw: Uint8Array;
  try {
    raw = fromBase64(match[2]);
  } catch {
    throw new ConfigError(`${name} key is not valid base64`);
  }
  if (raw.length !== 32) throw new ConfigError(`${name} key must be 32 bytes`);
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
  return { version: match[1], key };
};

export interface TokenCipher {
  readonly version: string;
  encrypt(plaintext: string, context: string): Promise<string>;
  decrypt(version: string, sealed: string, context: string): Promise<string>;
}

/**
 * AES-256-GCM with a fresh 96-bit IV per value. `context` (e.g. user id and field) is bound as
 * additional data so a ciphertext cannot be moved to another row. The previous key is kept for
 * decryption only, so the current key can rotate without signing everyone out.
 */
export const createTokenCipher = async (env: {
  TOKEN_ENCRYPTION_KEY?: string;
  TOKEN_ENCRYPTION_KEY_PREVIOUS?: string;
}): Promise<TokenCipher> => {
  const current = await parseKey("TOKEN_ENCRYPTION_KEY", env.TOKEN_ENCRYPTION_KEY);
  if (!current) throw new ConfigError("TOKEN_ENCRYPTION_KEY is not set");
  const previous = await parseKey("TOKEN_ENCRYPTION_KEY_PREVIOUS", env.TOKEN_ENCRYPTION_KEY_PREVIOUS);
  const keys = new Map([[current.version, current.key]]);
  if (previous && previous.version !== current.version) keys.set(previous.version, previous.key);

  return {
    version: current.version,
    async encrypt(plaintext, context) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const sealed = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv, additionalData: encoder.encode(context) },
        current.key,
        encoder.encode(plaintext),
      );
      return `${base64url(iv)}.${base64url(new Uint8Array(sealed))}`;
    },
    async decrypt(version, sealed, context) {
      const key = keys.get(version);
      if (!key) throw new ConfigError("no encryption key for a stored token version");
      const [iv, data] = sealed.split(".");
      if (!iv || !data) throw new Error("malformed sealed value");
      const plain = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: fromBase64(iv), additionalData: encoder.encode(context) },
        key,
        fromBase64(data),
      );
      return decoder.decode(plain);
    },
  };
};
