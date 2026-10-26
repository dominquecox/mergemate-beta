import { describe, expect, it } from "vitest";
import { ConfigError } from "../src/errors";
import { createTokenCipher, pkceChallenge, timingSafeEqual } from "../src/lib/crypto";
import { testEncryptionKey } from "./helpers";

describe("token cipher", () => {
  it("round-trips and uses a fresh IV per value", async () => {
    const cipher = await createTokenCipher({ TOKEN_ENCRYPTION_KEY: testEncryptionKey("1") });
    const a = await cipher.encrypt("ghu_value", "ctx");
    const b = await cipher.encrypt("ghu_value", "ctx");
    expect(a).not.toBe(b);
    expect(a).not.toContain("ghu_value");
    expect(await cipher.decrypt("1", a, "ctx")).toBe("ghu_value");
  });

  it("refuses a ciphertext moved to another row", async () => {
    const cipher = await createTokenCipher({ TOKEN_ENCRYPTION_KEY: testEncryptionKey("1") });
    const sealed = await cipher.encrypt("ghu_value", "github:access:user-a");
    await expect(cipher.decrypt("1", sealed, "github:access:user-b")).rejects.toThrow();
  });

  it("decrypts with the previous key after rotation", async () => {
    const oldKey = testEncryptionKey("1");
    const before = await createTokenCipher({ TOKEN_ENCRYPTION_KEY: oldKey });
    const sealed = await before.encrypt("ghu_value", "ctx");
    const after = await createTokenCipher({ TOKEN_ENCRYPTION_KEY: testEncryptionKey("2"), TOKEN_ENCRYPTION_KEY_PREVIOUS: oldKey });
    expect(after.version).toBe("2");
    expect(await after.decrypt("1", sealed, "ctx")).toBe("ghu_value");
  });

  it.each([undefined, "no-version", "1:c2hvcnQ="])("rejects key config %s without echoing it", async (value) => {
    const err = await createTokenCipher(value ? { TOKEN_ENCRYPTION_KEY: value } : {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConfigError);
    if (value) expect((err as ConfigError).detail).not.toContain(value);
  });
});

describe("helpers", () => {
  it("computes the RFC 7636 S256 example", async () => {
    expect(await pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("compares in constant time", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
  });
});
