import { describe, expect, it } from "vitest";
import { PRIVACY_FACTS } from "../src/workspace/privacy";

describe("privacy strip copy", () => {
  it("distinguishes authorized coding capabilities from approval and release actions", () => {
    const text = PRIVACY_FACTS.join(" ");
    expect(text).toMatch(/cannot merge, approve, comment/);
    expect(text).toMatch(/explicit authorization/);
    expect(text).toMatch(/branch and draft PR/);
    expect(text).toMatch(/never used to train/);
    expect(text).not.toMatch(/\$|price|free/i);
  });
});
