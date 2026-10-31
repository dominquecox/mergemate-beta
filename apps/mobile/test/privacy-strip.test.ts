import { describe, expect, it } from "vitest";
import { PRIVACY_FACTS } from "../src/workspace/privacy";

describe("privacy strip copy", () => {
  it("states only approved facts and never promises writes", () => {
    const text = PRIVACY_FACTS.join(" ");
    expect(text).toMatch(/cannot merge, approve, comment/);
    expect(text).toMatch(/never used to train/);
    expect(text).not.toMatch(/\$|price|free/i);
  });
});
