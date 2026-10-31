import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { sessionEndedMessage } from "../src/auth/session-ended";

describe("expired demo", () => {
  it("says the demo ended and offers both ways forward", () => {
    expect(sessionEndedMessage(true)).toMatch(/demo has ended/);
    expect(sessionEndedMessage(true)).toMatch(/sign in with GitHub/);
  });
  it("keeps the normal message for a real session", () => {
    expect(sessionEndedMessage(false)).toBe("Your session has ended. Sign in again to continue.");
  });
  it("is used by the unauthorized handler and clears the demo flag", () => {
    const src = fs.readFileSync(path.join(__dirname, "../src/context/AuthContext.tsx"), "utf8");
    expect(src).toContain("sessionEndedMessage(wasDemo)");
    expect(src).toMatch(/setIsDemo\(false\);\s*StorageService\.setDemoFlag\(false\)/);
  });
});
