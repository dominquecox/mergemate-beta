import { describe, it, expect } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import { base64UrlEncode, createDeviceId, createPkcePair, type PkcePrimitives } from "../src/auth/pkce";
import { AuthCallbackRequest, AuthStartRequest, DeviceId } from "@mergemate/contracts";

const node: PkcePrimitives = {
  randomBytes: (n) => new Uint8Array(randomBytes(n)),
  sha256Base64Url: async (v) => createHash("sha256").update(v).digest("base64url"),
};

describe("PKCE", () => {
  it("encodes base64url without padding", () => {
    for (const len of [1, 2, 3, 16, 31, 32, 33]) {
      const bytes = new Uint8Array(randomBytes(len));
      expect(base64UrlEncode(bytes)).toBe(Buffer.from(bytes).toString("base64url"));
    }
  });

  it("makes a verifier and challenge the API accepts", async () => {
    const { verifier, challenge } = await createPkcePair(node);
    expect(AuthStartRequest.safeParse({ codeChallenge: challenge, platform: "web" }).success).toBe(true);
    expect(AuthCallbackRequest.safeParse({ code: "c", state: "s", codeVerifier: verifier }).success).toBe(true);
    expect(challenge).toBe(createHash("sha256").update(verifier).digest("base64url"));
  });

  it("makes a new verifier every time", async () => {
    const a = await createPkcePair(node);
    const b = await createPkcePair(node);
    expect(a.verifier).not.toBe(b.verifier);
  });

  it("makes a device id the push API accepts", () => {
    expect(DeviceId.safeParse(createDeviceId(node)).success).toBe(true);
  });
});
